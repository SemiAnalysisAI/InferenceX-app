import { describe, expect, it } from 'vitest';

import { buildDatasetFromNeutral, buildRunSummary } from './reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeCollectiveXSeries,
  makeInvalidCaseAttempt,
  makeRawMatrix,
  makeRawShard,
  makeRunMeta,
} from './test-fixture';

function requestedOf(shard: Record<string, unknown>) {
  const identity = shard.identity as {
    case_id: string;
    case_factors: { sku: string; case: Record<string, unknown> };
  };
  return {
    caseId: identity.case_id,
    sku: identity.case_factors.sku,
    disposition: 'runnable' as const,
    case: identity.case_factors.case,
  };
}

describe('CollectiveX artifact assembly', () => {
  it('builds the current view from matrix cases and result shards', () => {
    const dataset = makeCollectiveXDataset();
    expect(dataset.version).toBe(1);
    expect(dataset.series).toHaveLength(3);
    expect(dataset.coverage).toHaveLength(5);
    expect(dataset.run).toMatchObject({
      requested_cases: 5,
      measured_cases: 3,
      unsupported_cases: 1,
      terminal_cases: 4,
      measured_points: 30,
      terminal_points: 40,
      requested_points: 50,
    });
  });

  it('maps series identity and points', () => {
    const series = makeCollectiveXSeries();
    expect(series.series_id).toBe('h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-bf16');
    expect(series.backend).toBe('deepep-v2');
    expect(series.precision).toBe('bf16');
    expect(series.points).toHaveLength(10);
  });

  it('keeps bf16 and fp8 measurements of one cell as distinct labeled cases', () => {
    const dataset = makeCollectiveXDataset();
    const h200 = dataset.series.filter((series) => series.system.sku === 'h200-dgxc');
    expect(h200.map((series) => series.precision).toSorted()).toEqual(['bf16', 'fp8']);
    expect(new Set(h200.map((series) => series.series_id)).size).toBe(2);
    expect(dataset.coverage.find((row) => row.precision === 'fp8')).toMatchObject({
      case_id: 'h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-fp8',
      label: 'h200-dgxc · deepep-v2 · normal · decode · EP8 · fp8',
    });
    expect(
      dataset.coverage.find(
        (row) => row.case_id === 'h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-bf16',
      ),
    ).toMatchObject({
      precision: 'bf16',
      label: 'h200-dgxc · deepep-v2 · normal · decode · EP8 · bf16',
    });
  });

  it('defaults pre-FP8 artifacts without a precision field to bf16', () => {
    const dataset = buildDataset({ shards: [makeRawShard({ precision: null })] });
    expect(dataset.series[0].series_id).toBe(
      'h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform',
    );
    expect(dataset.series[0].precision).toBe('bf16');
    expect(dataset.coverage[0]).toMatchObject({
      precision: 'bf16',
      label: 'h200-dgxc · deepep-v2 · normal · decode · EP8 · bf16',
    });
  });

  it('keeps normal and low-latency measurements of one cell as distinct labeled cases', () => {
    const dataset = buildDataset({
      shards: [makeRawShard(), makeRawShard({ mode: 'low-latency' })],
    });
    expect(new Set(dataset.series.map((series) => series.series_id)).size).toBe(2);
    expect(dataset.series.map((series) => series.mode).toSorted()).toEqual([
      'low-latency',
      'normal',
    ]);
    expect(dataset.coverage.find((row) => row.mode === 'low-latency')).toMatchObject({
      case_id: 'h200-dgxc-deepep-v2-deepseek-v3-low-latency-decode-ep8-uniform-bf16',
      label: 'h200-dgxc · deepep-v2 · low-latency · decode · EP8 · bf16',
    });
  });

  it('defaults pre-LL artifacts without a mode field to normal kernels', () => {
    const dataset = buildDataset({ shards: [makeRawShard({ mode: null })] });
    expect(dataset.series[0].mode).toBe('normal');
    expect(dataset.coverage[0].mode).toBe('normal');
  });

  it('ignores non-result documents', () => {
    const shard = makeRawShard();
    const dataset = buildDatasetFromNeutral(
      makeRawMatrix([requestedOf(shard)]),
      [shard, { record_type: 'samples', rows: [] }],
      makeRunMeta(),
    );
    expect(dataset.series).toHaveLength(1);
  });

  it('normalizes in-band failure reasons', () => {
    const dataset = buildDataset({
      shards: [
        makeInvalidCaseAttempt({ reasons: ['semantic correctness or routing identity failed'] }),
      ],
    });
    expect(dataset.series).toHaveLength(0);
    expect(dataset.coverage[0]).toMatchObject({
      outcome: 'invalid',
      reason: 'semantic-correctness-or-routing-identity-failed',
    });
  });

  it('keeps capacity-limited points omitted by a successful backend', () => {
    const dataset = buildDataset({
      shards: [
        makeRawShard({
          phase: 'prefill',
          rows: [{ tokensPerRank: 256 }, { tokensPerRank: 512 }],
        }),
      ],
    });
    expect(dataset.coverage[0].points.map((point) => point.terminal_status)).toEqual([
      'measured',
      'measured',
      'unsupported',
      'unsupported',
    ]);
    expect(dataset.coverage[0].points.at(-1)).toMatchObject({
      tokens_per_rank: 2048,
      reason: 'backend-token-capacity',
    });
  });

  it('does not read a success shard with no rows as a capacity wall', () => {
    // Math.max() of no rows is -Infinity, which would put every ladder point
    // "beyond the largest measured" and report a token-capacity limit that was
    // never observed. Nothing was measured, so every point is pending.
    const dataset = buildDataset({ shards: [makeRawShard({ rows: [] })] });
    const points = dataset.coverage[0].points;
    expect(points.map((point) => point.terminal_status)).toEqual(points.map(() => 'pending'));
    expect(points.every((point) => point.reason === 'not-measured')).toBe(true);
  });

  it('keeps unsupported and pending cases distinct', () => {
    const dataset = makeCollectiveXDataset();
    expect(dataset.coverage.find((row) => row.sku === 'b300')).toMatchObject({
      outcome: 'unsupported',
      reason: 'backend-platform-unsupported',
      detail: 'unsupported by the selected backend/platform',
    });
    expect(dataset.coverage.find((row) => row.sku === 'b200-dgxc')).toMatchObject({
      outcome: 'pending',
      reason: 'pending',
    });
  });

  it('maps an nccl-ep backend series (the 4th pluggable backend)', () => {
    const series = makeCollectiveXSeries({ backend: 'nccl-ep', implName: 'nccl-ep' });
    expect(series.backend).toBe('nccl-ep');
    expect(series.series_id).toContain('nccl-ep');
    expect(series.points).toHaveLength(10);
  });

  it('displays only AMD and NVIDIA vendor cases', () => {
    const dataset = buildDataset({
      shards: [
        makeRawShard(),
        makeRawShard({ sku: 'mi355x', vendor: 'AMD' }),
        makeRawShard({ sku: 'www', vendor: 'www' }),
      ],
    });

    expect(dataset.series.map((series) => series.system.vendor).toSorted()).toEqual([
      'amd',
      'nvidia',
    ]);
    expect(dataset.series.map((series) => series.system.sku).toSorted()).toEqual([
      'h200-dgxc',
      'mi355x',
    ]);
    expect(dataset.coverage.map((row) => row.sku).toSorted()).toEqual(['h200-dgxc', 'mi355x']);
    expect(dataset.run).toMatchObject({
      requested_cases: 2,
      measured_cases: 2,
      covered_skus: ['h200-dgxc', 'mi355x'],
    });
  });

  it('derives a per-GPU payload bandwidth from total_logical_bytes', () => {
    const dispatch = makeCollectiveXSeries().points[0].components.dispatch;
    // total_logical_bytes (400000000) / ep (8) / p50 latency (417 µs) → GB/s.
    expect(dispatch?.payload_data_rate_gbps_at_latency_percentile?.p50).toBeCloseTo(
      (400000000 / 8 / 417) * 1e-3,
      3,
    );
    // Distinct from the aggregate activation rate (activation bytes, no ep split):
    // the payload rate reads total_logical_bytes and divides by the EP world size.
    expect(dispatch?.payload_data_rate_gbps_at_latency_percentile?.p50).not.toBeCloseTo(
      dispatch?.activation_data_rate_gbps_at_latency_percentile?.p50 ?? 0,
      1,
    );
  });

  it('does not invent rates for zero-byte or unavailable components', () => {
    const zeroStage = makeCollectiveXSeries({ rows: [{ stageZeroBytes: true }] }).points[0]
      .components.stage;
    expect(zeroStage?.activation_data_rate_gbps_at_latency_percentile?.p50).toBe(0);
    expect(
      makeCollectiveXSeries({ rows: [{ stageUnavailable: true }] }).points[0].components.stage,
    ).toBeNull();
  });

  it('rejects malformed and cross-version artifacts', () => {
    expect(() => buildDatasetFromNeutral({}, [], makeRunMeta())).toThrow(/matrix/);
    const shard = makeRawShard();
    shard.version = 2;
    expect(() =>
      buildDatasetFromNeutral(makeRawMatrix([requestedOf(shard)]), [shard], makeRunMeta()),
    ).toThrow(/version/);
  });
});

describe('CollectiveX kv-transfer assembly', () => {
  it('assembles kv cases beside EP coverage without cross-contamination', () => {
    const dataset = buildDataset({ shards: [makeRawShard()], kv: [{}] });
    expect(dataset.coverage).toHaveLength(1);
    expect(dataset.series).toHaveLength(1);
    expect(dataset.kv).toHaveLength(1);
    const kase = dataset.kv![0];
    expect(kase).toMatchObject({
      sku: 'gb200',
      backend: 'nixl',
      fabric: 'rdma',
      workload: 'kv-dsv4',
      precision: 'fp8',
      outcome: 'success',
      vendor: 'nvidia',
    });
    expect(kase.rows).toHaveLength(4);
    expect(kase.rows[0]).toMatchObject({
      kind: 'paged',
      isl: 32768,
      page_tokens: 64,
      batch: 1,
      op: 'pull',
      gbps_p50: 7.39,
      verify_passed: true,
    });
    // KV cases count into the run totals (the visibility gate) but not points.
    expect(dataset.run).toMatchObject({
      requested_cases: 2,
      measured_cases: 2,
      kv_requested_cases: 1,
      kv_measured_cases: 1,
    });
    expect(dataset.run.covered_skus).toContain('gb200');
    expect(dataset.run.requested_points).toBe(10);
  });

  it('coerces the kv entrypoint string version against the numeric matrix version', () => {
    const dataset = buildDataset({ kv: [{ version: '1' }] });
    expect(dataset.kv![0].outcome).toBe('success');
  });

  it('carries a failed kv shard outcome and reason without rows', () => {
    const dataset = buildDataset({
      kv: [{ status: 'invalid', reasons: ['transfer verification failed'] }],
    });
    const kase = dataset.kv![0];
    expect(kase.outcome).toBe('invalid');
    expect(kase.reason).toBe('transfer-verification-failed');
    expect(kase.rows).toHaveLength(0);
    expect(dataset.run.failed_cases).toBe(1);
  });

  it('marks a requested kv case with no shard as pending', () => {
    const dataset = buildDataset({ kv: [{ omitShard: true }] });
    expect(dataset.kv![0]).toMatchObject({ outcome: 'pending', vendor: null, rows: [] });
    expect(dataset.run.terminal_cases).toBe(1); // the EP shard only
  });

  it('summarizes kv case counts for the run picker', () => {
    const dataset = buildDataset({
      kv: [{}, { sku: 'mi355x', backend: 'mori-io', vendor: 'amd' }],
    });
    const summary = buildRunSummary(dataset);
    expect(summary.kv_cases).toEqual({ requested: 2, measured: 2 });
    expect(summary.requested_cases).toBe(3);
  });

  it('keeps a kv-only run visible through the case totals', () => {
    const kv = buildDataset({ shards: [], kv: [{}] });
    expect(kv.coverage).toHaveLength(0);
    expect(kv.series).toHaveLength(0);
    expect(kv.run.requested_cases).toBe(1);
    expect(kv.run.covered_skus).toEqual(['gb200']);
  });
});
