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

function pct(value: number) {
  return { p50: value, p90: value, p95: value, p99: value };
}

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

  it('maps the chained pair period, its floors, and its health signal', () => {
    const series = makeCollectiveXSeries({ chained: true, chainBarrier: true });
    expect(series.chained_period).toBe(true);
    expect(series.chain_barrier).toBe(true);
    const point = series.points[0];
    expect(point.components.pair_period?.latency_us.p50).toBe(844);
    // Floors and the spread carry the full percentile axis, like every other
    // measured block — not a single collapsed number.
    expect(point.chain_floor_us?.dispatch?.p50).toBe(388);
    expect(point.chain_floor_us?.combine?.p50).toBe(351);
    expect(point.pair_spread_us?.p50).toBe(12);
    expect(point.pair_spread_us?.p99).toBeCloseTo(12 * 1.2, 6);
  });

  it('gives the pair period the round trip byte provenance it shares', () => {
    // A pair moves one dispatch + one combine — the roundtrip's payload — and
    // the artifact carries no provenance of its own, so the derived rates must
    // come from the roundtrip rather than reading as unavailable.
    const point = makeCollectiveXSeries({ chained: true }).points[0];
    expect(point.components.pair_period?.payload_bytes).toBe(
      point.components.roundtrip?.payload_bytes,
    );
    expect(
      point.components.pair_period?.payload_data_rate_gbps_at_latency_percentile?.p50,
    ).toBeCloseTo((784763904 / 8 / 844) * 1e-3, 3);
  });

  it('leaves artifacts predating the chained schedule with no chain fields', () => {
    const series = makeCollectiveXSeries();
    expect(series.chained_period).toBe(false);
    expect(series.chain_barrier).toBe(false);
    expect(series.points[0].components.pair_period).toBeNull();
    expect(series.points[0].chain_floor_us).toBeNull();
    expect(series.points[0].pair_spread_us).toBeNull();
  });

  it('reads a measured pair period as chained even without the implementation flag', () => {
    // The flag and the component ship together, but the component is the
    // evidence: a shard carrying one without the other still ran chained.
    const shard = makeRawShard({ chained: true });
    (shard.implementation as Record<string, unknown>).chained_period = undefined;
    const dataset = buildDataset({ shards: [shard] });
    expect(dataset.series[0].chained_period).toBe(true);
  });

  it('never reads the unrelated burst-estimator `period` as the chained pair period', () => {
    // `components.period` is an opt-in burst estimator some backends emit. Its
    // name is one token from `pair_period`; mapping it as the headline would
    // publish a different measurement under the pair period's label.
    const both = makeCollectiveXSeries({ chained: true, burstPeriod: true });
    expect(both.points[0].components.pair_period?.latency_us.p50).toBe(844);
    expect(both.points[0].components).not.toHaveProperty('period');

    // On its own it must not make a series read as chained, and the headline
    // must stay on the round trip.
    const burstOnly = makeCollectiveXSeries({ burstPeriod: true });
    expect(burstOnly.chained_period).toBe(false);
    expect(burstOnly.points[0].components.pair_period).toBeNull();
    expect(burstOnly.points[0].components.roundtrip?.latency_us.p50).toBe(921);
  });

  it('reads an unavailable floor as unmeasured without hiding its sibling', () => {
    const shard = makeRawShard({ chained: true });
    const rows = (shard.measurement as { rows: Record<string, unknown>[] }).rows;
    rows[0].chain_floor_us = {
      dispatch: {
        availability: 'measured',
        origin: 'chained-cross-rank-min',
        percentiles_us: pct(9),
      },
      combine: { availability: 'unavailable', origin: null, percentiles_us: null, sample_count: 0 },
    };
    const point = buildDataset({ shards: [shard] }).series[0].points[0];
    expect(point.chain_floor_us?.dispatch?.p50).toBe(9);
    expect(point.chain_floor_us?.combine).toBeNull();
  });

  it('drops chain blocks that do not carry percentiles', () => {
    // Defensive: a producer-side shape change must read as "not measured"
    // rather than surfacing a nonsense floor.
    const shard = makeRawShard({ chained: true });
    const rows = (shard.measurement as { rows: Record<string, unknown>[] }).rows;
    rows[0].chain_floor_us = { dispatch: 388, combine: null };
    rows[0].chain_health = { pair_spread_us: 12 };
    const point = buildDataset({ shards: [shard] }).series[0].points[0];
    expect(point.chain_floor_us).toBeNull();
    expect(point.pair_spread_us).toBeNull();
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
