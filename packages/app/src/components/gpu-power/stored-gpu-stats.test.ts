import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeGpuMetricStats,
  parseGpuMetricsCsv,
  type GpuMetricSample,
} from '@semianalysisai/inferencex-db/etl/gpu-metrics-csv';
import {
  prepareGpuMetricsArtifact,
  statMetricColumn,
} from '@semianalysisai/inferencex-db/etl/gpu-metrics-ingest';

import { storedGpuStatsForMetric } from './stored-gpu-stats';
import { ALL_METRIC_OPTIONS, computeGpuStats, parseCsvData, type GpuMetricRow } from './types';

function storedStats(samples: GpuMetricSample[]) {
  return computeGpuMetricStats(samples).map((row) => ({
    ...row,
    metric: statMetricColumn(row.metric),
  }));
}

function assertAllMetricStats(samples: GpuMetricSample[], rows: GpuMetricRow[]) {
  const digest = storedStats(samples);
  for (const { key } of ALL_METRIC_OPTIONS) {
    const actual = storedGpuStatsForMetric(digest, key);
    const expected = computeGpuStats(rows, key);
    expect(actual, key).toHaveLength(expected.length);
    for (const [index, row] of actual.entries()) {
      expect(row.gpuIndex).toBe(expected[index].gpuIndex);
      expect(row.count).toBe(expected[index].count);
      // ETL sums sorted samples while the live reader sums recording order.
      for (const field of ['min', 'max', 'mean', 'median', 'p95', 'p99', 'stddev'] as const) {
        expect(row[field], `${key}.${field}`).toBeCloseTo(expected[index][field], 10);
      }
    }
  }
}

describe('storedGpuStatsForMetric', () => {
  it.each(['UTC', 'America/Los_Angeles'])(
    'matches live NVIDIA and ingest populations across DST in %s',
    (timezone) => {
      const csv = [
        'timestamp,index,power.draw [W]',
        '2026/03/08 02:30:00.000,0,100',
        '2026/03/08 02:30:00.000,0,900',
        '2026/03/08 03:30:00.000,0,300',
      ].join('\n');
      const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-stats-dst-'));
      const originalTimezone = process.env.TZ;
      try {
        process.env.TZ = timezone;
        fs.writeFileSync(path.join(artifactDir, 'gpu_metrics.csv'), csv);
        const [prepared] = prepareGpuMetricsArtifact({
          artifactDir,
          artifactName: 'gpu_metrics_nvidia_dst',
        });
        expect(
          prepared.samples.map((sample) => new Date(sample.timestampMs).toISOString()),
        ).toEqual(['2026-03-08T02:30:00.000Z', '2026-03-08T03:30:00.000Z']);
        const live = parseCsvData(csv);
        // Preserve raw timestamps for the bundle's later context-offset adjustment.
        expect(live.map((row) => row.timestamp)).toEqual([
          '2026/03/08 02:30:00.000',
          '2026/03/08 03:30:00.000',
        ]);
        expect(live.map((row) => row.power)).toEqual([100, 300]);
        const actual = computeGpuStats(live, 'power');
        expect(actual).toEqual([
          {
            gpuIndex: 0,
            count: 2,
            min: 100,
            max: 300,
            mean: 200,
            median: 200,
            p95: 290,
            p99: 298,
            stddev: 100,
          },
        ]);
        const { metric: _metric, ...expected } = prepared.stats[0];
        expect(actual).toEqual([expected]);
      } finally {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
        fs.rmSync(artifactDir, { recursive: true, force: true });
      }
    },
  );

  it('preserves NVIDIA units, zero readings, and full-record percentiles', () => {
    const csv = [
      'timestamp, index, power.draw [W], temperature.gpu, clocks.current.sm [MHz], clocks.current.memory [MHz], utilization.gpu [%], utilization.memory [%]',
      '2026/09/21 00:00:00, 0, 0 W, N/A, 120 MHz, 3996 MHz, 0 %, 0 %',
      '2026/09/21 00:00:01, 0, 912.1 W, 61, 1965 MHz, 3996 MHz, 98 %, 74 %',
      '2026/09/21 00:00:02, 0, 187.8 W, 35, 120 MHz, 3996 MHz, 0 %, 0 %',
      // Conflicting stop-time flush must not change the first reading.
      '2026/09/21 00:00:02, 0, 999 W, 90, 120 MHz, 3996 MHz, 0 %, 0 %',
    ].join('\n');
    const samples = parseGpuMetricsCsv(csv)!.samples.slice(0, 3);
    assertAllMetricStats(samples, parseCsvData(csv));
    const [power] = storedGpuStatsForMetric(storedStats(samples), 'power');
    expect(power.count).toBe(3);
    expect(power.median).toBe(187.8);
    expect(power.p95).toBeCloseTo(839.67, 10);
    expect(power.p99).toBeCloseTo(897.614, 10);
  });

  it('maps every AMD metric without converting missing readings to zero', () => {
    const csv = [
      'timestamp,gpu,gfx_activity,umc_activity,mm_activity,socket_power,gfx_voltage,soc_voltage,mem_voltage,gfx_0_clk,mem_0_clk,fclk_0_clk,socclk_0_clk,edge,hotspot,mem',
      '1789948800,0,0,0,N/A,0,N/A,N/A,N/A,N/A,2000,1250,39,N/A,N/A,24',
      '1789948801,0,95,80,5,1180,850,900,1250,2402,2050,1300,40,55,78,60',
      '1789948801,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
    ].join('\n');
    const samples = parseGpuMetricsCsv(csv)!.samples.slice(0, 2);
    assertAllMetricStats(samples, parseCsvData(csv));
    expect(storedGpuStatsForMetric(storedStats(samples), 'gfxVoltage')[0]).toMatchObject({
      count: 1,
      mean: 850,
      stddev: 0,
    });
  });
});
