import { describe, expect, it } from 'vitest';

import {
  bucketPowerSeries,
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
