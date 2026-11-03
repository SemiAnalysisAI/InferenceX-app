import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { SEQUENCE_LENGTH_SKETCHES_VERSION, STATS_VERSION } from './agentic-shared';
import type { DbClient } from '../connection.js';

import { computeDerivedFromBlob, getDerivedAgenticMetrics } from './derived-agentic-metrics.js';

function rec(
  conversation_id: string,
  turn_index: number,
  fields: { isl: number; osl: number; ttft_ms: number; latency_ms: number },
): string {
  return JSON.stringify({
    metadata: { conversation_id, turn_index, benchmark_phase: 'profiling' },
    metrics: {
      request_latency: { value: fields.latency_ms, unit: 'ms' },
      time_to_first_token: { value: fields.ttft_ms, unit: 'ms' },
      input_sequence_length: { value: fields.isl, unit: 'tokens' },
      output_sequence_length: { value: fields.osl, unit: 'tokens' },
    },
  });
}

describe('computeDerivedFromBlob', () => {
  it('returns null when no usable records', () => {
    const out = computeDerivedFromBlob('');
    expect(out.e2el_per_osl).toBeNull();
  });

  it('computes per-request E2EL/OSL ratios pooled across sessions', () => {
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s2', 0, { isl: 200, osl: 100, ttft_ms: 1000, latency_ms: 4000 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(2);
    expect(out.e2el_per_osl?.p50).toBeCloseTo(0.03, 8);
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.038, 8);
    expect(out.e2el_per_osl?.p75).toBeCloseTo(0.035, 8);
  });

  it('OSL cancels out of the ratio when TTFT and ITL are identical', () => {
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 100, ttft_ms: 2000, latency_ms: 3980 }),
      rec('s2', 0, { isl: 100, osl: 1000, ttft_ms: 2000, latency_ms: 21_980 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(2);
    expect(out.e2el_per_osl?.p50).toBeCloseTo((0.0398 + 0.02198) / 2, 8);
  });

  it('drops records missing required fields and skips non-profiling phase', () => {
    const lines = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      JSON.stringify({
        metadata: { conversation_id: 's1', turn_index: 1, benchmark_phase: 'profiling' },
        metrics: {
          request_latency: { value: 1000, unit: 'ms' },
          input_sequence_length: { value: 100, unit: 'tokens' },
          output_sequence_length: { value: 50, unit: 'tokens' },
        },
      }),
      JSON.stringify({
        metadata: { conversation_id: 's2', turn_index: 0, benchmark_phase: 'warmup' },
        metrics: {
          request_latency: { value: 9999, unit: 'ms' },
          time_to_first_token: { value: 9999, unit: 'ms' },
          input_sequence_length: { value: 100, unit: 'tokens' },
          output_sequence_length: { value: 50, unit: 'tokens' },
        },
      }),
    ];
    const out = computeDerivedFromBlob(lines.join('\n'));
    expect(out.e2el_per_osl?.n).toBe(1);
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.02, 8);
  });

  it('excludes osl=0 (cancelled/empty-output) turns from the ratio distribution', () => {
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s2', 0, { isl: 150, osl: 0, ttft_ms: 1000, latency_ms: 30000 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(1);
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.02, 8);
  });

  it('p90 across turns: 10-turn population picks the right rank', () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      rec('s1', i, {
        isl: 100,
        osl: 100,
        ttft_ms: 100,
        latency_ms: (i + 1) * 1000,
      }),
    );
    const out = computeDerivedFromBlob(turns.join('\n'));
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.091, 8);
  });
});

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

function statsRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    benchmark_result_id: 7,
    version: null,
    e2el_per_osl_p75: null,
    e2el_per_osl_p90: null,
    kv_cache_util: null,
    prefix_cache_hit_rate: null,
    ...overrides,
  };
}

interface WrittenStats {
  version: number;
  isl: unknown;
  osl: unknown;
  kvCacheUtil: unknown;
  prefixCacheHitRate: unknown;
  e2elPerOsl: { p75: number; p90: number; n: number } | null;
}

describe('getDerivedAgenticMetrics write-back', () => {
  it('self-heals aggregate_stats from the profile blob, carrying server fields forward', async () => {
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s1', 1, { isl: 200, osl: 100, ttft_ms: 1000, latency_ms: 4000 }),
    ].join('\n');
    const blob = gzipSync(Buffer.from(jsonl));

    const staleServerKv = { mean: 0.4, p50: 0.4, p75: 0.5, p90: 0.6, p99: 0.7, n: 3 };

    const { sql, calls } = mockSql([
      [statsRow({ version: STATS_VERSION - 1, kv_cache_util: staleServerKv })],
      [{ benchmark_result_id: 7, trace_replay_id: 870, has_server_metrics: true }],
      [{ parts: 0, inline_size: blob.length }],
      [{ data: blob }],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(1 / 0.038, 6);
    expect(result[7]?.p75_e2e_norm_intvty).toBeCloseTo(1 / 0.035, 6);

    expect(calls).toHaveLength(5);
    expect(calls[4]!.text).toContain('update agentic_trace_replay set aggregate_stats');
    expect(calls[4]!.text).toContain('aggregate_stats = ?::jsonb');

    const [written, sketches, sketchesVersion, traceReplayId] = calls[4]!.values as [
      WrittenStats,
      Buffer | null,
      number | null,
      number,
    ];
    expect(traceReplayId).toBe(870);
    expect(sketches).not.toBeNull();
    expect(sketchesVersion).toBe(SEQUENCE_LENGTH_SKETCHES_VERSION);
    expect(written.version).toBe(STATS_VERSION);
    expect(written.e2elPerOsl?.n).toBe(2);
    expect(written.e2elPerOsl?.p90).toBeCloseTo(0.038, 8);
    expect(written.isl).not.toBeNull();
    expect(written.osl).not.toBeNull();
    expect(written.kvCacheUtil).toEqual(staleServerKv);
  });

  it('does not stamp the bundle when a server blob exists but no server fields are stored', async () => {
    const jsonl = rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 });
    const blob = gzipSync(Buffer.from(jsonl));

    const { sql, calls } = mockSql([
      [statsRow({})],
      [{ benchmark_result_id: 7, trace_replay_id: 870, has_server_metrics: true }],
      [{ parts: 0, inline_size: blob.length }],
      [{ data: blob }],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(50, 6);
    expect(calls).toHaveLength(4);
    expect(calls.some((c) => c.text.includes('update agentic_trace_replay'))).toBe(false);
  });

  it('stamps the bundle with null server fields when the point has no server blob', async () => {
    const cancelled = JSON.parse(
      rec('s1', 1, { isl: 300, osl: 100, ttft_ms: 500, latency_ms: 3000 }),
    ) as { metadata: Record<string, unknown> };
    cancelled.metadata.was_cancelled = true;
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      JSON.stringify(cancelled),
    ].join('\n');
    const blob = gzipSync(Buffer.from(jsonl));

    const { sql, calls } = mockSql([
      [statsRow({})],
      [{ benchmark_result_id: 7, trace_replay_id: 870, has_server_metrics: false }],
      [{ parts: 0, inline_size: blob.length }],
      [{ data: blob }],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    // Cancelled requests count toward the latency ratio but not toward ISL/OSL.
    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(1 / 0.029, 6);
    expect(calls).toHaveLength(5);
    const [written, ...columns] = calls[4]!.values as [WrittenStats, ...unknown[]];
    expect(columns.at(-1)).toBe(870);
    expect(written.version).toBe(STATS_VERSION);
    expect(written.e2elPerOsl?.n).toBe(2);
    expect(written.isl).toMatchObject({ n: 1, p50: 100 });
    expect(written.kvCacheUtil).toBeNull();
    expect(written.prefixCacheHitRate).toBeNull();
  });

  it('takes the fast path (no blob read, no write-back) when stats are current', async () => {
    const { sql, calls } = mockSql([
      [statsRow({ version: STATS_VERSION, e2el_per_osl_p75: 0.04, e2el_per_osl_p90: 0.05 })],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    expect(result[7]?.p75_e2e_norm_intvty).toBeCloseTo(25, 6);
    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(20, 6);
    expect(calls).toHaveLength(1);
  });

  it('maps a missing ratio bundle to nulls on the fast path', async () => {
    const { sql } = mockSql([[statsRow({ version: STATS_VERSION })]]);

    const result = await getDerivedAgenticMetrics(sql, [7]);
    expect(result[7]).toEqual({ id: 7, p75_e2e_norm_intvty: null, p90_e2e_norm_intvty: null });
  });
});
