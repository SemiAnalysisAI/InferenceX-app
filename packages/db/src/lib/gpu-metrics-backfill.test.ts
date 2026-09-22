import { describe, expect, it, vi } from 'vitest';

import type { ArtifactMeta } from './github-artifacts.js';
import {
  collectMissingTelemetryExpectations,
  pairGpuMetricsArtifacts,
} from './gpu-metrics-backfill.js';
import { mapBenchmarkRow } from '../etl/benchmark-mapper.js';
import { createSkipTracker } from '../etl/skip-tracker.js';
import type { Sql } from '../etl/db-utils.js';
import {
  readTelemetryReceipt,
  summarizeTelemetryReceipt,
  telemetryArtifactsForAttempt,
} from '../etl/telemetry-receipt.js';

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
  it('keeps expired sibling expectations unknown through an unrelated targeted repair', async () => {
    const artifacts = telemetryArtifactsForAttempt(
      [
        meta('bmk_previous_h200-cw_0', 1, '2026-09-10T00:00:00Z', true),
        meta('bmk_expired_h200-cw_0', 2, '2026-09-11T01:00:00Z', true),
        meta('bmk_healthy_h200-cw_0', 3, '2026-09-11T01:00:00Z'),
        meta('gpu_metrics_healthy_h200-cw_0', 4, '2026-09-11T01:00:00Z'),
      ],
      { run_attempt: 2, run_started_at: '2026-09-11T00:00:00Z' },
      2,
    );
    const pairs = pairGpuMetricsArtifacts(artifacts);
    const readRows = vi.fn(() => Promise.resolve([]));
    const missing = await collectMissingTelemetryExpectations(artifacts, pairs, null, readRows);
    expect(missing.errors).toEqual([
      {
        benchmarkArtifact: 'bmk_expired_h200-cw_0',
        artifactNames: ['gpu_metrics_expired_h200-cw_0', 'power_audit_expired_h200-cw_0'],
        error: 'Benchmark artifact expired; point identities unavailable',
      },
    ]);
    expect(missing.observations).toEqual([]);
    expect(readRows).not.toHaveBeenCalled();

    const storedPoint = { id: 10, model: 'dsr1', conc: 8, offload_mode: 'off' };
    const series = {
      id: 5,
      artifact_name: pairs[0]!.gpuMetrics.name,
      file_name: 'gpu_metrics.csv',
      sidecars: { seriesInventory: [{ fileName: 'gpu_metrics.csv', sampleCount: 1 }] },
      sample_count: 1,
      benchmark_result_ids: [storedPoint.id],
    };
    const sql = vi
      .fn()
      .mockResolvedValueOnce([storedPoint])
      .mockResolvedValueOnce([series])
      .mockResolvedValueOnce([storedPoint])
      .mockResolvedValueOnce([series]) as unknown as Sql;
    const observation = {
      identity: storedPoint,
      artifactNames: [series.artifact_name],
      produced: true,
    };
    const run = { runId: 123, runAttempt: 2 };
    const receipt = await readTelemetryReceipt(sql, run, [observation]);
    receipt.expectationErrors = missing.errors;
    summarizeTelemetryReceipt(receipt);
    expect(receipt.counts).toMatchObject({
      expectedPoints: null,
      storedPoints: 1,
      linkedPoints: 1,
      apiReadablePoints: 0,
    });

    const targeted = await collectMissingTelemetryExpectations(
      artifacts,
      pairs,
      series.artifact_name,
      readRows,
    );
    expect(targeted).toEqual({ observations: [], errors: [] });
    expect(readRows).not.toHaveBeenCalled();
    const repaired = await readTelemetryReceipt(sql, run, [observation], {
      previous: receipt,
      targeted: true,
    });
    expect(repaired.expectationErrors).toEqual(missing.errors);
    expect(repaired.counts.expectedPoints).toBeNull();
  });

  it.each(['gpu_metrics', 'power_audit'])(
    'records the expired sibling for the selected %s target without downloading',
    async (prefix) => {
      const artifacts = [meta('bmk_expired_h200-cw_0', 1, undefined, true)];
      const readRows = vi.fn(() => Promise.resolve([]));
      const result = await collectMissingTelemetryExpectations(
        artifacts,
        [],
        `${prefix}_expired_h200-cw_0`,
        readRows,
      );
      expect(result.observations).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        benchmarkArtifact: artifacts[0]!.name,
        artifactNames: expect.arrayContaining([`${prefix}_expired_h200-cw_0`]),
      });
      expect(readRows).not.toHaveBeenCalled();
    },
  );

  it('does not report an expired retry superseded by a retained sibling', async () => {
    const artifacts = [
      meta('bmk_healthy_h200-cw_0', 1, '2026-09-11T00:00:00Z', true),
      meta('bmk_healthy_h200-dgxc-slurm_1', 2, '2026-09-11T01:00:00Z'),
      meta('gpu_metrics_healthy_h200-dgxc-slurm_1', 3, '2026-09-11T01:00:00Z'),
    ];
    const pairs = pairGpuMetricsArtifacts(artifacts);
    const readRows = vi.fn(() => Promise.resolve([]));
    expect(await collectMissingTelemetryExpectations(artifacts, pairs, null, readRows)).toEqual({
      observations: [],
      errors: [],
    });
    expect(readRows).not.toHaveBeenCalled();
  });

  it('isolates a corrupt unpaired sibling while retaining later expectations and valid recovery pairs', async () => {
    const artifacts = [
      meta('bmk_broken_h200-cw_0', 1),
      meta('bmk_missing_h200-cw_0', 2),
      meta('bmk_healthy_h200-cw_0', 3),
      meta('gpu_metrics_healthy_h200-cw_0', 4),
    ];
    const pairs = pairGpuMetricsArtifacts(artifacts);
    const row = mapBenchmarkRow(
      {
        infmax_model_prefix: 'dsr1',
        hw: 'b200',
        framework: 'sglang',
        precision: 'fp4',
        isl: 8192,
        osl: 1024,
        conc: 8,
        tp: 1,
      },
      createSkipTracker(),
    )!;
    const result = await collectMissingTelemetryExpectations(artifacts, pairs, null, (artifact) =>
      artifact.id === 1
        ? Promise.reject(new Error('Malformed benchmark JSON'))
        : Promise.resolve([row]),
    );
    expect(result.errors).toEqual([
      {
        benchmarkArtifact: 'bmk_broken_h200-cw_0',
        artifactNames: ['gpu_metrics_broken_h200-cw_0', 'power_audit_broken_h200-cw_0'],
        error: 'Malformed benchmark JSON',
      },
    ]);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      identity: { model: 'dsr1', conc: 8 },
      artifactNames: ['gpu_metrics_missing_h200-cw_0', 'power_audit_missing_h200-cw_0'],
      produced: false,
    });
    expect(pairs.map((pair) => pair.gpuMetrics.name)).toEqual(['gpu_metrics_healthy_h200-cw_0']);
  });
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

  it('lets a power_audit bundle stand in only when its suffix has no gpu_metrics upload', () => {
    // The bundle is listed before its gpu_metrics sibling on purpose: input
    // order alone must not decide the winner.
    const pairs = pairGpuMetricsArtifacts([
      meta('power_audit_cfg-mn_b200-slurm_0', 1),
      meta('bmk_cfg-mn_b200-slurm_0', 2),
      meta('power_audit_cfg-sn_h200-cw_0', 4),
      meta('gpu_metrics_cfg-sn_h200-cw_0', 3),
      meta('bmk_cfg-sn_h200-cw_0', 5),
      meta('power_audit_orphan_b200-slurm_0', 6),
    ]);
    expect(pairs.map((pair) => [pair.gpuMetrics.name, pair.benchmarks.name])).toEqual([
      ['gpu_metrics_cfg-sn_h200-cw_0', 'bmk_cfg-sn_h200-cw_0'],
      ['power_audit_cfg-mn_b200-slurm_0', 'bmk_cfg-mn_b200-slurm_0'],
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
