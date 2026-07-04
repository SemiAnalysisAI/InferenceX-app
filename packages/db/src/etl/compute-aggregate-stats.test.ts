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
    expect(stats.normalizedSessionTimeS).toBeNull();
    expect(stats.p90PrefillTpsPerUser).toBeNull();
    expect(stats.normalizedE2e400).toBeNull();
  });

  it('computes ISL/OSL percentiles + derived metrics from the profile blob', async () => {
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

    // Derived: prefill TPS per turn = isl / (ttft/1000) = 1000 for each, so p90 = 1000.
    expect(stats.p90PrefillTpsPerUser).toBeCloseTo(1000, 6);
    // Normalized session time: T̃_i = T_i × (mean_load / load_i), then mean.
    //   loads = [150, 275, 400], mean_load = 275
    //   scaled times (s) = [1×275/150, 2×275/275, 3×275/400] = [1.8333, 2, 2.0625]
    //   mean ≈ 1.9653
    expect(stats.normalizedSessionTimeS).toBeCloseTo(1.9653, 3);
    expect(stats.normalizedE2e400?.n).toBe(3);
    expect(stats.normalizedE2e400?.p90).toBeGreaterThan(0);
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
    expect(stats.normalizedSessionTimeS).toBeNull();
    expect(stats.p90PrefillTpsPerUser).toBeNull();
    expect(stats.normalizedE2e400).toBeNull();
  });

  it('tolerates a malformed profile blob by leaving its metrics null', async () => {
    // A random non-gzip buffer triggers a gunzip error — code path swallows it.
    const garbage = Buffer.from('not-gzip-data');
    const stats = await computeAggregateStats({ profileBlob: garbage, serverBlob: null });
    expect(stats.isl).toBeNull();
    expect(stats.osl).toBeNull();
    expect(stats.normalizedSessionTimeS).toBeNull();
    expect(stats.p90PrefillTpsPerUser).toBeNull();
    expect(stats.normalizedE2e400).toBeNull();
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
    expect(merged.normalizedE2e400?.p90).toBeGreaterThan(0);
    expect(merged.kvCacheUtil).toEqual(existing.kvCacheUtil);
    expect(merged.prefixCacheHitRate).toEqual(existing.prefixCacheHitRate);
  });
});
