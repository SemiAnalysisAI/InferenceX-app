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
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    const p = percentilesOf(xs);
    expect(p).not.toBeNull();
    expect(p!.n).toBe(100);
    expect(p!.mean).toBeCloseTo(50.5, 6);
    expect(p!.p50).toBeCloseTo(50.5, 6);
    expect(p!.p75).toBeCloseTo(75.25, 6);
    expect(p!.p90).toBeCloseTo(90.1, 6);
    expect(p!.p95).toBeCloseTo(95.05, 6);
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
        metadata: { benchmark_phase: 'profiling', was_cancelled: true },
        metrics: {
          input_sequence_length: { value: 7777, unit: 'tokens' },
          output_sequence_length: { value: 7777, unit: 'tokens' },
        },
      }),
      JSON.stringify({
        metadata: { benchmark_phase: 'profiling' },
        metrics: {
          input_sequence_length: { value: 200, unit: 'tokens' },
          output_sequence_length: { value: 75, unit: 'tokens' },
        },
      }),
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
                { start_ns: 2, rate: 0 },
              ],
            },
          ],
        },
        'vllm:prefix_cache_queries': {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 100 },
                { start_ns: 1, rate: 100 },
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

  it('extracts TensorRT-LLM KV utilization and prefix cache hit rate', () => {
    const json = JSON.stringify({
      metrics: {
        trtllm_kv_cache_utilization: {
          series: [
            {
              timeslices: [
                { start_ns: 0, avg: 0.2 },
                { start_ns: 1, avg: 0.6 },
              ],
            },
          ],
        },
        trtllm_prompt_cached_tokens: {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 70 },
                { start_ns: 1, rate: 20 },
              ],
            },
          ],
        },
        trtllm_prompt_tokens: {
          series: [
            {
              timeslices: [
                { start_ns: 0, rate: 100 },
                { start_ns: 1, rate: 50 },
              ],
            },
          ],
        },
      },
    });

    const out = extractServerMetricSamples(json);
    expect(out.kvCacheUtil).toEqual([0.2, 0.6]);
    expect(out.prefixCacheHitRate).toEqual([0.7, 0.4]);
  });
});

interface WrittenStats {
  version: number;
  isl: unknown;
  osl: unknown;
  kvCacheUtil: { mean: number } | null;
  prefixCacheHitRate: unknown;
  e2elPerOsl: { p90: number; n: number } | null;
}

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
      [{ benchmark_result_id: 7, stats: staleStats }],
      [{ benchmark_result_id: 7, trace_replay_id: 870, has_profile: true }],
      [{ parts: 0, inline_size: profileBlob.length }],
      [{ data: profileBlob }],
      [{ benchmark_result_id: 7, server_blob: serverBlob }],
    ]);

    const result = await getAgenticAggregates(sql, [7]);

    expect(result[7]?.isl?.n).toBe(2);
    expect(result[7]?.kvCacheUtil?.mean).toBeCloseTo(0.25, 6);

    expect(calls).toHaveLength(6);
    expect(calls[5]!.text).toContain('update agentic_trace_replay set aggregate_stats');
    expect(calls[5]!.text).toContain('::jsonb where id');

    const [written, traceReplayId] = calls[5]!.values as [WrittenStats, number];
    expect(traceReplayId).toBe(870);
    expect(written.version).toBe(STATS_VERSION);
    expect(written.kvCacheUtil?.mean).toBeCloseTo(0.25, 6);
    expect(written.e2elPerOsl?.n).toBe(2);
    expect(written.e2elPerOsl?.p90).toBeCloseTo(0.038, 8);
    expect(written).not.toHaveProperty('normalizedSessionTimeS');
    expect(written).not.toHaveProperty('p90PrefillTpsPerUser');
    expect(written).not.toHaveProperty('normalizedE2e400');
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
      [{ benchmark_result_id: 7, trace_replay_id: 870, profile_blob: null }],
      [{ benchmark_result_id: 7, server_blob: null }],
    ]);

    await getAgenticAggregates(sql, [7]);

    expect(calls).toHaveLength(3);
    expect(calls.some((c) => c.text.includes('update agentic_trace_replay'))).toBe(false);
  });
});
