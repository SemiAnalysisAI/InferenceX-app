import { describe, expect, it } from 'vitest';

import { gpuMetricsRunCoverage, type GpuMetricSeriesCoverageRow } from './gpu-metrics-coverage';

const rows: GpuMetricSeriesCoverageRow[] = ['gpu_metrics_a', 'power_audit_b'].map((name) => ({
  artifact_name: name,
  file_name: 'gpu_metrics.csv',
  sample_count: 10,
  run_artifact_inventory: ['gpu_metrics_a', 'power_audit_b'],
  series_inventory: [{ fileName: 'gpu_metrics.csv', sampleCount: 10 }],
}));

describe('gpuMetricsRunCoverage', () => {
  it('certifies complete inventories so --all can skip the run', () => {
    expect(gpuMetricsRunCoverage(rows)).toEqual({ status: 'complete', missingArtifacts: [] });
  });

  it('keeps a failed artifact eligible for backfill even when another artifact was stored', () => {
    expect(gpuMetricsRunCoverage(rows.slice(0, 1))).toEqual({
      status: 'partial',
      missingArtifacts: ['power_audit_b'],
    });
  });

  it('unions all retained expectations instead of trusting one successful artifact', () => {
    const changed = rows.map((row, i) => ({
      ...row,
      run_artifact_inventory: i === 0 ? ['gpu_metrics_a'] : ['power_audit_b', 'gpu_metrics_c'],
    }));
    expect(gpuMetricsRunCoverage(changed)).toEqual({
      status: 'partial',
      missingArtifacts: ['gpu_metrics_c'],
    });
  });

  it.each([
    { inventory: [{ fileName: 'gpu_metrics.csv', sampleCount: 11 }] },
    {
      inventory: [
        { fileName: 'gpu_metrics.csv', sampleCount: 10 },
        { fileName: 'node2.csv', sampleCount: 10 },
      ],
    },
  ])('detects an incomplete artifact from its retained series inventory', ({ inventory }) => {
    expect(
      gpuMetricsRunCoverage([
        { ...rows[0]!, run_artifact_inventory: ['gpu_metrics_a'], series_inventory: inventory },
      ]),
    ).toEqual({ status: 'partial', missingArtifacts: [] });
  });

  it.each([undefined, null, [], ['gpu_metrics_a', 3]].map((inventory) => ({ inventory })))(
    'keeps missing or malformed inventory unknown and eligible for repair',
    ({ inventory }) => {
      expect(
        gpuMetricsRunCoverage(rows.map((row) => ({ ...row, run_artifact_inventory: inventory }))),
      ).toEqual({ status: 'unknown', missingArtifacts: [] });
    },
  );
});
