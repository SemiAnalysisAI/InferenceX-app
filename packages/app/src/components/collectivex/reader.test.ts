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
    expect(dataset.series).toHaveLength(2);
    expect(dataset.coverage).toHaveLength(4);
    expect(dataset.run).toMatchObject({
      requested_cases: 4,
      measured_cases: 2,
      unsupported_cases: 1,
      terminal_cases: 3,
      measured_points: 20,
      terminal_points: 30,
      requested_points: 40,
    });
  });

  it('maps series identity and points', () => {
    const series = makeCollectiveXSeries();
    expect(series.series_id).toBe('h200-dgxc-deepep-v2-deepseek-v3-normal-decode-ep8-uniform');
    expect(series.backend).toBe('deepep-v2');
    expect(series.points).toHaveLength(10);
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
