import { expect, it } from 'vitest';
import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';
import { storedPowerSeries } from '@semianalysisai/inferencex-db/power-series/stored-power-series';

it.each(['gpu_metrics.csv', 'samples.csv'])(
  'preserves measured zero and omits missing power in stored %s',
  (fileName) => {
    const timestamp = '2026-09-12T20:20:41.000Z';
    const time = Date.parse(timestamp) / 1000;
    const series: GpuMetricSeries = {
      id: 1,
      artifactName: 'power_audit_test',
      fileName,
      vendor: 'nvidia',
      sampleIntervalS: 1,
      sampleCount: 2,
      gpuCount: 1,
      startedAt: timestamp,
      endedAt: timestamp,
      sidecars: {
        identity: [{ hostname: 'node', gpu_index: 0, gpu_uuid: 'GPU-0' }],
        validations: {
          'power_validation_test.json': {
            selected_window: { start_time_unix: time, end_time_unix: time + 1 },
          },
        },
      },
      stats: [],
      data: [
        { timestamp, index: 0, temperature: 40 },
        { timestamp, index: 0, power: 0 },
      ],
    };
    expect(storedPowerSeries([series])[0]?.power).toEqual([[0]]);
    expect(storedPowerSeries([{ ...series, data: [series.data[0]] }])).toEqual([]);
  },
);
