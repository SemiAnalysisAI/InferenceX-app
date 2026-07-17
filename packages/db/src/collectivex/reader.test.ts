import { describe, expect, it } from 'vitest';

import { buildDatasetFromNeutral } from './reader';
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
      label: 'h200-dgxc · deepep-v2 · decode · EP8 · fp8',
    });
    expect(
      dataset.coverage.find(
        (row) => row.case_id === 'h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform-bf16',
      ),
    ).toMatchObject({
      precision: 'bf16',
      label: 'h200-dgxc · deepep-v2 · decode · EP8 · bf16',
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
      label: 'h200-dgxc · deepep-v2 · decode · EP8 · bf16',
    });
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
