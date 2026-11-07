import { describe, expect, it } from 'vitest';

import { buildArtifactPlan } from './ci-artifact-preparation.js';
import type { ArtifactMeta } from './github-artifacts.js';

const artifact = (id: number, name: string, created_at: string, expired = false): ArtifactMeta => ({
  id,
  name,
  created_at,
  expired,
  archive_download_url: `https://api.github.com/artifacts/${id}/zip`,
});

describe('buildArtifactPlan', () => {
  it('matches normal ingestion by keeping the newest upload for each exact name', () => {
    const plan = buildArtifactPlan('100', '100', [
      artifact(1, 'bmk_model_runner_01', '2026-01-01T00:00:00Z'),
      artifact(2, 'bmk_model_runner_01', '2026-01-02T00:00:00Z'),
      artifact(3, 'bmk_model_runner_02', '2026-01-01T00:00:00Z'),
    ]);

    expect(plan.artifacts.map((item) => item.id)).toEqual([2, 3]);
    expect(plan.reused).toBe(false);
  });

  it('uses the merge-run changelog for reused sweeps', () => {
    const plan = buildArtifactPlan(
      '100',
      '200',
      [
        artifact(1, 'bmk_model', '2026-01-01T00:00:00Z'),
        artifact(2, 'changelog-metadata', '2026-01-01T00:01:00Z'),
      ],
      [
        artifact(3, 'changelog-metadata', '2026-01-02T00:00:00Z'),
        artifact(4, 'changelog-metadata', '2026-01-03T00:00:00Z'),
      ],
    );

    expect(plan.artifacts.map((item) => item.id)).toEqual([1, 4]);
    expect(plan.reused).toBe(true);
  });

  it('rejects reuse without source artifacts or a merge changelog', () => {
    expect(() =>
      buildArtifactPlan(
        '100',
        '200',
        [artifact(1, 'changelog-metadata', '2026-01-01T00:00:00Z')],
        [artifact(2, 'changelog-metadata', '2026-01-02T00:00:00Z', true)],
      ),
    ).toThrow('No unexpired artifacts found on source run 100');

    expect(() =>
      buildArtifactPlan('100', '200', [artifact(1, 'bmk_model', '2026-01-01T00:00:00Z')], []),
    ).toThrow('No changelog-metadata artifact found on merge run 200');
  });

  it('downloads the largest artifacts first', () => {
    const sized = (id: number, name: string, size_in_bytes?: number) => ({
      ...artifact(id, name, '2026-01-01T00:00:00Z'),
      size_in_bytes,
    });
    const plan = buildArtifactPlan('100', '100', [
      sized(1, 'run-stats', 10),
      sized(2, 'bmk_b', 5_000_000_000),
      sized(3, 'gpu_metrics_b', 300),
      sized(4, 'bmk_a', 300),
      sized(5, 'changelog-metadata'),
    ]);

    expect(plan.artifacts.map((item) => item.id)).toEqual([2, 4, 3, 1, 5]);
  });

  it('skips server logs without a same-suffix benchmark and artifacts ingest never reads', () => {
    const at = '2026-01-01T00:00:00Z';
    const plan = buildArtifactPlan('100', '100', [
      artifact(1, 'bmk_agentic_cfg_pool_01', at),
      artifact(2, 'multinode_server_logs_cfg_pool_01', at),
      artifact(3, 'multinode_server_logs_cfg_pool_00', at),
      artifact(4, 'bmk_single_h200_1', at),
      artifact(5, 'server_logs_single_h200_1', at),
      artifact(6, 'server_logs_agentic_cfg_pool_01', at),
      artifact(7, 'server_logs_eval-only_h200_1', at),
      artifact(8, 'eval_eval-only_h200_1', at),
      artifact(9, 'job_event_cfg_pool_01', at),
      artifact(10, 'job_events', at),
      artifact(11, 'al_gate_dataset', at),
      artifact(12, 'agentic_cfg_pool_01', at),
      artifact(13, 'server_logs_expired_h200_1', at),
      artifact(14, 'bmk_expired_h200_1', at, true),
    ]);

    expect(plan.artifacts.map((item) => item.name)).toEqual([
      'agentic_cfg_pool_01',
      'bmk_agentic_cfg_pool_01',
      'bmk_single_h200_1',
      'eval_eval-only_h200_1',
      'multinode_server_logs_cfg_pool_01',
      'server_logs_agentic_cfg_pool_01',
      'server_logs_single_h200_1',
    ]);
  });

  it('keeps every server log when a reused bundle may hold their benchmarks', () => {
    const at = '2026-01-01T00:00:00Z';
    const plan = buildArtifactPlan('100', '100', [
      artifact(1, 'reused-ingest-artifacts', at),
      artifact(2, 'server_logs_cfg_h200_1', at),
    ]);

    expect(plan.artifacts.map((item) => item.name)).toEqual([
      'reused-ingest-artifacts',
      'server_logs_cfg_h200_1',
    ]);
  });
});
