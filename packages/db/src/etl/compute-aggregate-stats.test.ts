import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  STATS_VERSION,
  computeAggregateStats,
  mergeProfileStatsUpgrade,
} from './compute-aggregate-stats.js';

/** Build a minimal `profile_export.jsonl` from a few synthetic requests. */
function makeProfileBlob(requests: { isl: number; osl: number; rl?: number; ttft?: number }[]) {
  const lines = requests.map((r, i) =>
    JSON.stringify({
      metadata: {
        benchmark_phase: 'profiling',
        conversation_id: `conv-${i}`,
        turn_index: 0,
      },
      metrics: {
        input_sequence_length: { value: r.isl, unit: 'tokens' },
        output_sequence_length: { value: r.osl, unit: 'tokens' },
        request_latency: { value: r.rl ?? 1000, unit: 'ms' },
        time_to_first_token: { value: r.ttft ?? 100, unit: 'ms' },
      },
    }),
  );
  return gzipSync(Buffer.from(lines.join('\n')));
}

/** Build a tiny server_metrics_json blob with KV util + prefix cache series. */
function makeServerBlob() {
  const json = JSON.stringify({
    metrics: {
      'vllm:kv_cache_usage_perc': {
        series: [
          {
            timeslices: [
              { start_ns: 0, end_ns: 1, avg: 0.2 },
              { start_ns: 1, end_ns: 2, avg: 0.5 },
              { start_ns: 2, end_ns: 3, avg: 0.8 },
            ],
          },
        ],
      },
      'vllm:prefix_cache_hits': {
        series: [{ timeslices: [{ start_ns: 0, rate: 80 }] }],
      },
      'vllm:prefix_cache_queries': {
        series: [{ timeslices: [{ start_ns: 0, rate: 100 }] }],
      },
    },
  });
  return gzipSync(Buffer.from(json));
}

describe('computeAggregateStats', () => {
  it('returns the current STATS_VERSION in the bundle', async () => {
    const stats = await computeAggregateStats({ profileBlob: null, serverBlob: null });
    expect(stats.version).toBe(STATS_VERSION);
  });

  it('leaves every metric null when both blobs are null', async () => {
    const stats = await computeAggregateStats({ profileBlob: null, serverBlob: null });
    expect(stats.isl).toBeNull();
    expect(stats.osl).toBeNull();
    expect(stats.kvCacheUtil).toBeNull();
    expect(stats.prefixCacheHitRate).toBeNull();
    expect(stats.e2elPerOsl).toBeNull();
  });

  it('computes ISL/OSL percentiles + the E2EL/OSL ratio bundle from the profile blob', async () => {
    const profileBlob = makeProfileBlob([
      { isl: 100, osl: 50, rl: 1000, ttft: 100 },
      { isl: 200, osl: 75, rl: 2000, ttft: 200 },
      { isl: 300, osl: 100, rl: 3000, ttft: 300 },
    ]);
    const stats = await computeAggregateStats({ profileBlob, serverBlob: null });

    expect(stats.isl?.n).toBe(3);
    expect(stats.isl?.mean).toBeCloseTo(200, 6);
    expect(stats.osl?.n).toBe(3);
    expect(stats.osl?.mean).toBeCloseTo(75, 6);

    // Server-side metrics still null when there's no server blob.
    expect(stats.kvCacheUtil).toBeNull();
    expect(stats.prefixCacheHitRate).toBeNull();

    // Per-request E2EL/OSL ratios (s/tok): 1/50=0.02, 2/75≈0.02667, 3/100=0.03.
    expect(stats.e2elPerOsl?.n).toBe(3);
    expect(stats.e2elPerOsl?.p50).toBeCloseTo(2 / 75, 6);
    // p90 of 3 values (linear interpolation): pos=1.8 → 0.02667 + 0.8×(0.03-0.02667)
    expect(stats.e2elPerOsl?.p90).toBeCloseTo(2 / 75 + 0.8 * (0.03 - 2 / 75), 6);
  });

  it('computes KV util + prefix hit rate from the server blob alone', async () => {
    const stats = await computeAggregateStats({
      profileBlob: null,
      serverBlob: makeServerBlob(),
    });
    expect(stats.kvCacheUtil?.n).toBe(3);
    expect(stats.kvCacheUtil?.mean).toBeCloseTo(0.5, 6);
    expect(stats.prefixCacheHitRate?.n).toBe(1);
    expect(stats.prefixCacheHitRate?.mean).toBeCloseTo(0.8, 6);

    // Profile-derived metrics absent.
    expect(stats.isl).toBeNull();
    expect(stats.osl).toBeNull();
    expect(stats.e2elPerOsl).toBeNull();
  });

  it('tolerates a malformed profile blob by leaving its metrics null', async () => {
    // A random non-gzip buffer triggers a gunzip error — code path swallows it.
    const garbage = Buffer.from('not-gzip-data');
    const stats = await computeAggregateStats({ profileBlob: garbage, serverBlob: null });
    expect(stats.isl).toBeNull();
    expect(stats.osl).toBeNull();
    expect(stats.e2elPerOsl).toBeNull();
    // Version still set so the row is considered "computed".
    expect(stats.version).toBe(STATS_VERSION);
  });
});

describe('mergeProfileStatsUpgrade', () => {
  it('updates profile metrics while preserving existing server distributions', async () => {
    const existing = await computeAggregateStats({
      profileBlob: null,
      serverBlob: makeServerBlob(),
    });
    const profile = await computeAggregateStats({
      profileBlob: makeProfileBlob([{ isl: 100, osl: 100, rl: 2080, ttft: 100 }]),
      serverBlob: null,
    });

    const merged = mergeProfileStatsUpgrade(existing, profile);
    expect(merged.version).toBe(STATS_VERSION);
    expect(merged.isl?.mean).toBe(100);
    expect(merged.e2elPerOsl?.p90).toBeCloseTo(2.08 / 100, 6);
    expect(merged.kvCacheUtil).toEqual(existing.kvCacheUtil);
    expect(merged.prefixCacheHitRate).toEqual(existing.prefixCacheHitRate);
  });

  it('drops the retired derived fields when upgrading a pre-v6 bundle', async () => {
    // Bundles written before v6 carry normalizedSessionTimeS /
    // p90PrefillTpsPerUser / normalizedE2e400 — the upgrade must not
    // resurrect them into the new bundle.
    const legacy = {
      version: STATS_VERSION - 1,
      isl: null,
      osl: null,
      kvCacheUtil: { mean: 0.4, p50: 0.4, p75: 0.5, p90: 0.6, p99: 0.7, n: 3 },
      prefixCacheHitRate: null,
      normalizedSessionTimeS: 999,
      p90PrefillTpsPerUser: 999,
      normalizedE2e400: { mean: 1, p50: 1, p75: 1, p90: 2, p99: 3, n: 5 },
    };
    const profile = await computeAggregateStats({
      profileBlob: makeProfileBlob([{ isl: 100, osl: 100, rl: 2080, ttft: 100 }]),
      serverBlob: null,
    });

    const merged = mergeProfileStatsUpgrade(legacy, profile);
    expect(merged.version).toBe(STATS_VERSION);
    expect(merged.kvCacheUtil).toEqual(legacy.kvCacheUtil);
    expect(merged).not.toHaveProperty('normalizedSessionTimeS');
    expect(merged).not.toHaveProperty('p90PrefillTpsPerUser');
    expect(merged).not.toHaveProperty('normalizedE2e400');
  });
});
