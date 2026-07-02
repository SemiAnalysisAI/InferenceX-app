import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { DbClient } from '../connection.js';

import {
  extractIslOsl,
  extractServerMetricSamples,
  getAgenticAggregates,
  percentilesOf,
  STATS_VERSION,
} from './agentic-aggregates';

describe('percentilesOf', () => {
  it('returns null for empty input', () => {
    expect(percentilesOf([])).toBeNull();
    expect(percentilesOf([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it('computes percentiles for a simple integer range', () => {
    // 1..100, evenly spaced — linear quantile is straightforward.
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    const p = percentilesOf(xs);
    expect(p).not.toBeNull();
    expect(p!.n).toBe(100);
    expect(p!.mean).toBeCloseTo(50.5, 6);
    expect(p!.p50).toBeCloseTo(50.5, 6);
    // For 100 sorted values, p75 = sorted[0.75 * 99] = sorted[74.25] interp.
    expect(p!.p75).toBeCloseTo(75.25, 6);
    expect(p!.p90).toBeCloseTo(90.1, 6);
    expect(p!.p99).toBeCloseTo(99.01, 6);
  });

  it('filters out non-finite values before computing', () => {
    const p = percentilesOf([1, 2, Number.NaN, 3, Number.POSITIVE_INFINITY, 4]);
    expect(p?.n).toBe(4);
    expect(p?.mean).toBeCloseTo(2.5, 6);
  });
});

describe('extractIslOsl', () => {
  it('reads input/output sequence length from profiling records', () => {
    const lines = [
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 100, unit: 'tokens' },
          output_sequence_length: { value: 50, unit: 'tokens' },
        },
      }),
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 200, unit: 'tokens' },
          output_sequence_length: { value: 75, unit: 'tokens' },
        },
      }),
      // warmup record — should be ignored
      JSON.stringify({
        metadata: { benchmark_phase: 'warmup' },
        metrics: {
          input_sequence_length: { value: 9999, unit: 'tokens' },
          output_sequence_length: { value: 9999, unit: 'tokens' },
        },
      }),
    ];
    const { isl, osl } = extractIslOsl(lines.join('\n'));
    expect(isl).toEqual([100, 200]);
    expect(osl).toEqual([50, 75]);
  });
});

describe('extractServerMetricSamples', () => {
  it('extracts KV cache util gauge and computes per-interval prefix hit rate', () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:kv_cache_usage_perc': {
          series: [
            {
              timeslices: [
                { start_ns: 0, end_ns: 1, avg: 0.1 },
                { start_ns: 1, end_ns: 2, avg: 0.5 },
                { start_ns: 2, end_ns: 3, avg: 0.9 },
              ],
            },
          ],
        },
        'vllm:prefix_cache_hits': {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 80 },
                { start_ns: 1, rate: 50 },
                { start_ns: 2, rate: 0 }, // skipped because matching queries.rate is 0
              ],
            },
          ],
        },
        'vllm:prefix_cache_queries': {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 100 }, // hit rate = 0.8
                { start_ns: 1, rate: 100 }, // hit rate = 0.5
                { start_ns: 2, rate: 0 },
              ],
            },
          ],
        },
      },
    });
    const { kvCacheUtil, prefixCacheHitRate } = extractServerMetricSamples(json);
    expect(kvCacheUtil).toEqual([0.1, 0.5, 0.9]);
    expect(prefixCacheHitRate).toEqual([0.8, 0.5]);
  });

  it('returns empty arrays when the JSON lacks the expected metric series', () => {
    const out = extractServerMetricSamples(JSON.stringify({ metrics: {} }));
    expect(out.kvCacheUtil).toEqual([]);
    expect(out.prefixCacheHitRate).toEqual([]);
  });
});

/** The write-back payload as bound to the UPDATE (a partial aggregate_stats). */
interface WrittenStats {
  version: number;
  isl: unknown;
  osl: unknown;
  kvCacheUtil: { mean: number } | null;
  prefixCacheHitRate: unknown;
  normalizedSessionTimeS: number | null;
  p90PrefillTpsPerUser: number | null;
  normalizedE2e400: unknown;
}

/** Capture SQL template text + bound values for the write-back assertions. */
function mockSql(queue: unknown[][]): {
  sql: DbClient;
  calls: { text: string; values: unknown[] }[];
} {
  const responses = [...queue];
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values });
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, calls };
}

/** One aiperf profiling record for the fallback profile blob. */
function profileRec(fields: {
  cid: string;
  isl: number;
  osl: number;
  ttft_ms: number;
  latency_ms: number;
}): string {
  return JSON.stringify({
    metadata: { conversation_id: fields.cid, turn_index: 0, benchmark_phase: 'profiling' },
    metrics: {
      request_latency: { value: fields.latency_ms, unit: 'ms' },
      time_to_first_token: { value: fields.ttft_ms, unit: 'ms' },
      input_sequence_length: { value: fields.isl, unit: 'tokens' },
      output_sequence_length: { value: fields.osl, unit: 'tokens' },
    },
  });
}

describe('getAgenticAggregates write-back', () => {
  it('recomputes ALL profile+server fields and writes a complete bundle back on the stale path', async () => {
    const profileBlob = gzipSync(
      Buffer.from(
        [
          profileRec({ cid: 's1', isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
          profileRec({ cid: 's1', isl: 200, osl: 50, ttft_ms: 1000, latency_ms: 2000 }),
        ].join('\n'),
      ),
    );
    const serverBlob = gzipSync(
      Buffer.from(
        JSON.stringify({
          metrics: {
            'vllm:kv_cache_usage_perc': {
              series: [{ timeslices: [{ start_ns: 0, avg: 0.25 }] }],
            },
          },
        }),
      ),
    );

    // Stale row with server AND derived fields we must NOT trust — the route
    // recomputes both from the blobs, so nothing is carried forward.
    const staleStats = {
      version: STATS_VERSION - 1,
      isl: null,
      osl: null,
      kvCacheUtil: { mean: 0.9, p50: 0.9, p75: 0.9, p90: 0.9, p99: 0.9, n: 1 },
      prefixCacheHitRate: null,
      normalizedSessionTimeS: 999,
      p90PrefillTpsPerUser: 999,
    };

    const { sql, calls } = mockSql([
      // fetchAggregateStatsRows
      [{ benchmark_result_id: 7, stats: staleStats }],
      // Pass 1: profile blob (+ trace_replay_id for write-back)
      [{ benchmark_result_id: 7, trace_replay_id: 870, profile_blob: profileBlob }],
      // Pass 2: server blob
      [{ benchmark_result_id: 7, server_blob: serverBlob }],
    ]);

    const result = await getAgenticAggregates(sql, [7]);

    // Response reflects the fresh recompute (isl/osl + kv from the blobs).
    expect(result[7]?.isl?.n).toBe(2);
    expect(result[7]?.kvCacheUtil?.mean).toBeCloseTo(0.25, 6);

    // 4 calls: stats read, profile read, server read, write-back UPDATE.
    expect(calls).toHaveLength(4);
    expect(calls[3]!.text).toContain('update agentic_trace_replay set aggregate_stats');
    expect(calls[3]!.text).toContain('::jsonb where id');

    // The payload OBJECT is bound directly (not stringified — that would
    // double-encode into a JSONB string).
    const [written, traceReplayId] = calls[3]!.values as [WrittenStats, number];
    expect(traceReplayId).toBe(870);
    expect(written.version).toBe(STATS_VERSION);
    // Server field FRESHLY recomputed (0.25), not the stale 0.9 carried forward.
    expect(written.kvCacheUtil?.mean).toBeCloseTo(0.25, 6);
    // Derived fields FRESHLY recomputed (not the stale 999s).
    expect(written.normalizedSessionTimeS).toBeCloseTo(3, 6);
    expect(written.p90PrefillTpsPerUser).toBeCloseTo(200, 6);
    expect(written.normalizedE2e400).not.toBeNull();
    expect(written.isl).not.toBeNull();
  });

  it('does not write back for an id whose profile blob is missing/malformed', async () => {
    const staleStats = {
      version: STATS_VERSION - 1,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
      normalizedSessionTimeS: null,
      p90PrefillTpsPerUser: null,
    };
    const { sql, calls } = mockSql([
      [{ benchmark_result_id: 7, stats: staleStats }],
      // Pass 1: no profile blob → nothing to recompute, nothing to heal.
      [{ benchmark_result_id: 7, trace_replay_id: 870, profile_blob: null }],
      // Pass 2: no server blob either.
      [{ benchmark_result_id: 7, server_blob: null }],
    ]);

    await getAgenticAggregates(sql, [7]);

    // stats read + 2 blob reads only — no write-back (profile parse never succeeded).
    expect(calls).toHaveLength(3);
    expect(calls.some((c) => c.text.includes('update agentic_trace_replay'))).toBe(false);
  });
});
