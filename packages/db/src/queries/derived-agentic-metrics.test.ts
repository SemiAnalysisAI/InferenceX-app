import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { STATS_VERSION } from './agentic-shared';
import type { DbClient } from '../connection.js';

import { computeDerivedFromBlob, getDerivedAgenticMetrics } from './derived-agentic-metrics.js';

/** Build one aiperf JSONL record for the synthetic fixture. */
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
    // Ratios (s per output token): 1.0/50 = 0.02, 4.0/100 = 0.04.
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s2', 0, { isl: 200, osl: 100, ttft_ms: 1000, latency_ms: 4000 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(2);
    expect(out.e2el_per_osl?.p50).toBeCloseTo(0.03, 8);
    // p90 of [0.02, 0.04]: pos = 0.9 → 0.02 + 0.9 × 0.02 = 0.038.
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.038, 8);
    expect(out.e2el_per_osl?.p75).toBeCloseTo(0.035, 8);
  });

  it('OSL cancels out of the ratio when TTFT and ITL are identical', () => {
    // Both requests: TTFT=2s, ITL=20ms — very different OSL/E2E, but the
    // per-token ratio only differs through the TTFT amortization term
    // (TTFT/OSL), which is the intended second-order OSL sensitivity.
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 100, ttft_ms: 2000, latency_ms: 3980 }),
      rec('s2', 0, { isl: 100, osl: 1000, ttft_ms: 2000, latency_ms: 21_980 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(2);
    // 3.98/100 = 0.0398 ≈ ITL + TTFT/OSL = 0.0198 + 0.02
    expect(out.e2el_per_osl?.p50).toBeCloseTo((0.0398 + 0.02198) / 2, 8);
  });

  it('drops records missing required fields and skips non-profiling phase', () => {
    const lines = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      // missing TTFT — should be skipped
      JSON.stringify({
        metadata: { conversation_id: 's1', turn_index: 1, benchmark_phase: 'profiling' },
        metrics: {
          request_latency: { value: 1000, unit: 'ms' },
          input_sequence_length: { value: 100, unit: 'tokens' },
          output_sequence_length: { value: 50, unit: 'tokens' },
        },
      }),
      // warmup phase — should be skipped
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
      // Cancelled / empty-output turn — osl=0 must be rejected by extractTurn
      // (the ratio would divide by zero).
      rec('s2', 0, { isl: 150, osl: 0, ttft_ms: 1000, latency_ms: 30000 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    expect(out.e2el_per_osl?.n).toBe(1);
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.02, 8);
  });

  it('p90 across turns: 10-turn population picks the right rank', () => {
    // Ratios 0.01..0.10 s/tok; p90 of 10 values (linear) = 0.091.
    const turns = Array.from({ length: 10 }, (_, i) =>
      rec('s1', i, {
        isl: 100,
        osl: 100,
        ttft_ms: 100,
        latency_ms: (i + 1) * 1000, // 1s..10s → ratios 0.01..0.10
      }),
    );
    const out = computeDerivedFromBlob(turns.join('\n'));
    expect(out.e2el_per_osl?.p90).toBeCloseTo(0.091, 8);
  });
});

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

describe('getDerivedAgenticMetrics write-back', () => {
  it('self-heals aggregate_stats from the profile blob, carrying server fields forward', async () => {
    // Two turns with ratios 0.02 and 0.04 s/tok → p90 = 0.038, p75 = 0.035.
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s1', 1, { isl: 200, osl: 100, ttft_ms: 1000, latency_ms: 4000 }),
    ].join('\n');
    const blob = gzipSync(Buffer.from(jsonl));

    // Stale v(N-1) row that DOES carry server-derived fields — they must be
    // preserved in the healed bundle (derived route can't recompute them).
    const staleServerKv = { mean: 0.4, p50: 0.4, p75: 0.5, p90: 0.6, p99: 0.7, n: 3 };
    const staleStats = {
      version: STATS_VERSION - 1,
      isl: null,
      osl: null,
      kvCacheUtil: staleServerKv,
      prefixCacheHitRate: null,
      normalizedSessionTimeS: 999,
      p90PrefillTpsPerUser: 999,
      normalizedE2e400: null,
    };

    const { sql, calls } = mockSql([
      // fetchAggregateStatsRows
      [{ benchmark_result_id: 7, stats: staleStats }],
      // fallback profile-blob query
      [{ benchmark_result_id: 7, trace_replay_id: 870, blob }],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    // Response is the freshly recomputed slow-tail inverse (tok/s/user).
    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(1 / 0.038, 6);
    expect(result[7]?.p75_e2e_norm_intvty).toBeCloseTo(1 / 0.035, 6);

    // 3 calls: stats read, blob read, write-back UPDATE.
    expect(calls).toHaveLength(3);
    expect(calls[2]!.text).toContain('update agentic_trace_replay set aggregate_stats');
    expect(calls[2]!.text).toContain('::jsonb where id');

    // The write-back binds a COMPLETE, version-stamped bundle at the new version,
    // recomputing profile fields and carrying server fields forward untouched.
    // The payload OBJECT is bound directly (not stringified — that would
    // double-encode into a JSONB string).
    interface WrittenStats {
      version: number;
      isl: unknown;
      osl: unknown;
      kvCacheUtil: unknown;
      e2elPerOsl: { p75: number; p90: number; n: number } | null;
    }
    const [written, traceReplayId] = calls[2]!.values as [WrittenStats, number];
    expect(traceReplayId).toBe(870);
    expect(written.version).toBe(STATS_VERSION);
    expect(written.e2elPerOsl?.n).toBe(2);
    expect(written.e2elPerOsl?.p90).toBeCloseTo(0.038, 8);
    expect(written.isl).not.toBeNull();
    expect(written.osl).not.toBeNull();
    // Server-derived field carried forward from the stale row (not re-read).
    expect(written.kvCacheUtil).toEqual(staleServerKv);
    // Retired legacy fields must not survive the heal.
    expect(written).not.toHaveProperty('normalizedSessionTimeS');
    expect(written).not.toHaveProperty('p90PrefillTpsPerUser');
    expect(written).not.toHaveProperty('normalizedE2e400');
  });

  it('does not stamp the bundle when there are no server fields to preserve', async () => {
    // A row with null (or pre-v3) stats has no kvCacheUtil / prefixCacheHitRate
    // for this route to carry forward, and it cannot recompute them — it never
    // reads the server blob. Stamping the current version anyway would look
    // complete downstream: the backfill's candidate query skips matching
    // versions and agentic-aggregates takes the fast path, so those fields
    // would stay null forever. The response is still served from the blob.
    const jsonl = rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 });
    const blob = gzipSync(Buffer.from(jsonl));

    const { sql, calls } = mockSql([
      // fetchAggregateStatsRows — no stored bundle at all
      [{ benchmark_result_id: 7, stats: null }],
      // fallback profile-blob query
      [{ benchmark_result_id: 7, trace_replay_id: 870, blob }],
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    // Caller still gets the freshly computed metric (1 / 0.02 s-per-token).
    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(50, 6);
    // Stats read + blob read only — no write-back UPDATE.
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.text.includes('update agentic_trace_replay'))).toBe(false);
  });

  it('takes the fast path (no blob read, no write-back) when stats are current', async () => {
    const currentStats = {
      version: STATS_VERSION,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
      e2elPerOsl: { mean: 0.03, p50: 0.03, p75: 0.04, p90: 0.05, p99: 0.06, n: 5 },
    };
    const { sql, calls } = mockSql([[{ benchmark_result_id: 7, stats: currentStats }]]);

    const result = await getDerivedAgenticMetrics(sql, [7]);

    expect(result[7]?.p75_e2e_norm_intvty).toBeCloseTo(25, 6);
    expect(result[7]?.p90_e2e_norm_intvty).toBeCloseTo(20, 6);
    // Only the stats read — no fallback blob query, no write-back.
    expect(calls).toHaveLength(1);
  });

  it('maps a missing ratio bundle to nulls on the fast path', async () => {
    const currentStats = {
      version: STATS_VERSION,
      isl: null,
      osl: null,
      kvCacheUtil: null,
      prefixCacheHitRate: null,
      e2elPerOsl: null,
    };
    const { sql } = mockSql([
      [{ benchmark_result_id: 7, stats: currentStats }],
      // fallback blob query fires for no ids → but guard returns before; keep
      // the queue empty-safe anyway.
    ]);

    const result = await getDerivedAgenticMetrics(sql, [7]);
    expect(result[7]).toEqual({ id: 7, p75_e2e_norm_intvty: null, p90_e2e_norm_intvty: null });
  });
});
