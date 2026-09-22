import { describe, expect, it } from 'vitest';

import {
  bucketPowerSeries,
  bucketPowerFiles,
  bucketTimeMs,
  meanPowerAt,
  parseTelemetryTimestampUtc,
  sumPowerAt,
  type GpuPowerSeries,
} from './power-series';
import type { GpuMetricRow } from './types';

function row(timestamp: string, index: number, power: number): GpuMetricRow {
  return {
    timestamp,
    index,
    power,
    temperature: 40,
    smClock: 1,
    memClock: 1,
    gpuUtil: 0,
    memUtil: 0,
  };
}

describe('parseTelemetryTimestampUtc', () => {
  it('reads runner nvidia-smi timestamps as UTC regardless of the browser zone', () => {
    // 2026-09-12 20:19:57.158Z; a local-time parse would shift by the host offset.
    expect(parseTelemetryTimestampUtc('2026/09/12 20:19:57.158')).toBe(
      Date.UTC(2026, 8, 12, 20, 19, 57, 158),
    );
    expect(parseTelemetryTimestampUtc('2026-09-12 20:19:57')).toBe(
      Date.UTC(2026, 8, 12, 20, 19, 57, 0),
    );
  });

  it('accepts ISO strings with a zone and numeric epochs', () => {
    expect(parseTelemetryTimestampUtc('2026-09-12T20:19:57.158Z')).toBe(
      Date.UTC(2026, 8, 12, 20, 19, 57, 158),
    );
    expect(parseTelemetryTimestampUtc('1789244397.158')).toBe(1789244397158);
    expect(parseTelemetryTimestampUtc('1789244397158')).toBe(1789244397158);
    expect(parseTelemetryTimestampUtc('N/A')).toBeNull();
  });
});

describe('bucketPowerSeries', () => {
  it('aligns every GPU on one-second buckets and marks missing samples null', () => {
    const rows = [
      row('2026/09/12 20:20:41.817', 0, 194.4),
      row('2026/09/12 20:20:41.820', 1, 192.4),
      row('2026/09/12 20:20:42.816', 0, 300),
      // GPU 1 skipped this tick; GPU 0 sampled twice in the next one.
      row('2026/09/12 20:20:43.815', 0, 400),
      row('2026/09/12 20:20:43.900', 0, 500),
      row('2026/09/12 20:20:43.818', 1, 350),
    ];
    const series = bucketPowerSeries('gpu_metrics_test', rows);
    expect(series).not.toBeNull();
    expect(series!.startMs).toBe(Date.UTC(2026, 8, 12, 20, 20, 41));
    expect(series!.bucketSeconds).toBe(1);
    expect(series!.gpus).toEqual([0, 1]);
    expect(series!.t).toEqual([0, 1, 2]);
    expect(series!.power).toEqual([
      [194.4, 300, 450],
      [192.4, null, 350],
    ]);
    expect(meanPowerAt(series!, 1)).toBe(300);
    expect(meanPowerAt(series!, 2)).toBe(400);
    expect(bucketTimeMs(series!, 2)).toBe(Date.UTC(2026, 8, 12, 20, 20, 43));
  });

  it('keeps the first sample at each GPU/timestamp before averaging distinct samples', () => {
    const rows = [
      row('2026/09/12 04:00:00.100', 0, 300),
      row('2026/09/12 04:00:00.100', 0, 300), // repeated monitor flush
      row('2026-09-12T04:00:00.100Z', 0, 999), // same instant, conflicting value
      row('2026/09/12 04:00:00.100', 1, 100), // different GPU remains independent
      row('2026/09/12 04:00:00.800', 0, 500),
      row('2026/09/12 04:00:01.100', 0, 700),
    ];
    expect(bucketPowerSeries('gpu_metrics_duplicate', rows)).toMatchObject({
      gpus: [0, 1],
      t: [0, 1],
      power: [
        [400, 700],
        [100, null],
      ],
    });
    expect(bucketPowerSeries('gpu_metrics_duplicate', rows, 2)).toMatchObject({
      bucketSeconds: 2,
      t: [0],
      power: [[500], [100]],
    });
  });

  it('omits empty buckets so long gaps do not pad the payload', () => {
    const series = bucketPowerSeries('gpu_metrics_gap', [
      row('2026/09/12 20:00:00.000', 0, 100),
      row('2026/09/12 20:00:10.000', 0, 200),
    ]);
    expect(series!.t).toEqual([0, 10]);
    expect(series!.power).toEqual([[100, 200]]);
  });

  it('drops unparseable rows and returns null when nothing remains', () => {
    expect(bucketPowerSeries('gpu_metrics_empty', [row('N/A', 0, 100)])).toBeNull();
    expect(
      bucketPowerSeries('gpu_metrics_empty', [row('2026/09/12 20:00:00', 0, Number.NaN)]),
    ).toBeNull();
    expect(() => bucketPowerSeries('x', [], 0)).toThrow(RangeError);
  });
});

describe('sumPowerAt', () => {
  const series: GpuPowerSeries = {
    artifact: 'power_audit_sweep',
    startMs: Date.UTC(2026, 8, 12, 20, 0, 0),
    bucketSeconds: 1,
    gpus: [0, 1, 2],
    t: [0, 1, 2],
    power: [
      [100, null, 300],
      [50, 60, null],
      [10, null, null],
    ],
  };

  it('sums a pool only when every one of its rows has a sample in the bucket', () => {
    expect(sumPowerAt(series, [0, 1, 2], 0)).toBe(160);
    expect(sumPowerAt(series, [1, 2], 0)).toBe(60);
    expect(sumPowerAt(series, [1], 1)).toBe(60);
  });

  it('returns null for a partial pool, an unsampled bucket, an empty pool or an unknown row', () => {
    // GPU 0 and 2 have no sample in bucket 1: a partial sum would read as a dip.
    expect(sumPowerAt(series, [0, 1, 2], 1)).toBeNull();
    expect(sumPowerAt(series, [0, 1], 2)).toBeNull();
    expect(sumPowerAt(series, [0, 2], 1)).toBeNull();
    expect(sumPowerAt(series, [], 0)).toBeNull();
    expect(sumPowerAt(series, [7], 0)).toBeNull();
  });
});

describe('bucketPowerFiles', () => {
  it('keeps repeated GPU indices from different host files separate with stable identity', () => {
    const time = '2026-09-12T04:00:00Z';
    const files = [
      { name: 'host-b/gpu_metrics.csv', data: [row(time, 0, 500)] },
      { name: 'host-a/gpu_metrics.csv', data: [row(time, 0, 100), row(time, 2, 200)] },
      { name: 'empty.csv', data: [] },
    ];
    const expected = {
      artifact: 'gpu_metrics_multinode',
      startMs: Date.parse(time),
      bucketSeconds: 1,
      gpus: [0, 1, 2],
      t: [0],
      power: [[100], [200], [500]],
      devices: [
        { id: 'host-a/gpu_metrics.csv/0' },
        { id: 'host-a/gpu_metrics.csv/2' },
        { id: 'host-b/gpu_metrics.csv/0' },
      ],
    };
    expect(bucketPowerFiles('gpu_metrics_multinode', files)).toEqual(expected);
    expect(bucketPowerFiles('gpu_metrics_multinode', files.toReversed())).toEqual(expected);
    expect(bucketPowerFiles('empty', [])).toBeNull();
    expect(bucketPowerFiles('single', [files[0]])?.gpus).toEqual([0]);
  });
});
