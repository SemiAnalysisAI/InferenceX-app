import { describe, expect, it } from 'vitest';

import type { ArtifactMeta } from './github-artifacts.js';
import { pairGpuMetricsArtifacts } from './gpu-metrics-backfill.js';

const meta = (
  name: string,
  id: number,
  created_at = '2026-09-11T00:00:00Z',
  expired = false,
): ArtifactMeta => ({
  id,
  name,
  created_at,
  expired,
  archive_download_url: `https://example.test/${id}`,
});

describe('pairGpuMetricsArtifacts', () => {
  it('pairs gpu_metrics with the exact bmk sibling and prefers the agentic sibling', () => {
    const pairs = pairGpuMetricsArtifacts([
      meta('gpu_metrics_cfg-a_h200-cw_0', 1),
      meta('bmk_cfg-a_h200-cw_0', 2),
      meta('gpu_metrics_cfg-b_h200-cw_0', 3),
      meta('bmk_agentic_cfg-b_h200-cw_0', 4),
      meta('bmk_cfg-b_h200-cw_0', 5),
      meta('gpu_metrics_orphan_h200-cw_0', 6),
      meta('eval_gpu_metrics_cfg-a_h200-cw_0', 7),
    ]);
    expect(pairs.map((pair) => [pair.gpuMetrics.name, pair.benchmarks.name])).toEqual([
      ['gpu_metrics_cfg-a_h200-cw_0', 'bmk_cfg-a_h200-cw_0'],
      ['gpu_metrics_cfg-b_h200-cw_0', 'bmk_agentic_cfg-b_h200-cw_0'],
    ]);
  });

  it('keeps only the newest retry per logical benchmark and drops expired uploads', () => {
    const pairs = pairGpuMetricsArtifacts([
      meta('gpu_metrics_cfg-a_h200-cw_0', 1, '2026-09-11T00:00:00Z'),
      meta('bmk_cfg-a_h200-cw_0', 2, '2026-09-11T00:00:00Z'),
      meta('gpu_metrics_cfg-a_h200-dgxc-slurm_1', 3, '2026-09-11T02:00:00Z'),
      meta('bmk_cfg-a_h200-dgxc-slurm_1', 4, '2026-09-11T02:00:00Z'),
      meta('gpu_metrics_cfg-c_h200-cw_0', 5, '2026-09-11T03:00:00Z', true),
      meta('bmk_cfg-c_h200-cw_0', 6, '2026-09-11T03:00:00Z'),
    ]);
    expect(pairs.map((pair) => pair.gpuMetrics.name)).toEqual([
      'gpu_metrics_cfg-a_h200-dgxc-slurm_1',
    ]);
  });
});
