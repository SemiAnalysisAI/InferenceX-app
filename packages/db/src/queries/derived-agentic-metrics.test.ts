import { describe, expect, it } from 'vitest';

import { computeDerivedFromBlob } from './derived-agentic-metrics.js';

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
  it('returns nulls when no usable records', () => {
    const out = computeDerivedFromBlob('');
    expect(out.normalized_session_time_s).toBeNull();
    expect(out.p90_prefill_tps_per_user).toBeNull();
    expect(out.normalized_e2e_400).toBeNull();
  });

  it('normalizes each request to 400 output tokens before taking percentiles', () => {
    const jsonl = [
      // Both requests have TTFT=2s and ITL=20ms, despite very different OSL/E2E.
      rec('s1', 0, { isl: 100, osl: 100, ttft_ms: 2000, latency_ms: 3980 }),
      rec('s2', 0, { isl: 100, osl: 1000, ttft_ms: 2000, latency_ms: 21_980 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);
    // 2s TTFT + 399 × 20ms ITL = 9.98s for both requests.
    expect(out.normalized_e2e_400?.n).toBe(2);
    expect(out.normalized_e2e_400?.p75).toBeCloseTo(9.98, 8);
    expect(out.normalized_e2e_400?.p90).toBeCloseTo(9.98, 8);
  });

  it('rescales single-session time and computes P90 prefill', () => {
    // One session, two turns. load = (100+50) + (200+50) = 400.
    // Single session ⇒ mean_load = load_i ⇒ T̃ = T = (1000+2000) ms = 3.0 s.
    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s1', 1, { isl: 200, osl: 50, ttft_ms: 1000, latency_ms: 2000 }),
    ].join('\n');
    const out = computeDerivedFromBlob(jsonl);
    expect(out.normalized_session_time_s).toBeCloseTo(3, 6);
    // Prefill TPS per turn: 100/0.5=200, 200/1.0=200 → global P90 = 200.
    expect(out.p90_prefill_tps_per_user).toBeCloseTo(200, 6);
  });

  it('rescales times across sessions with unequal load', () => {
    // s1: 1 turn, load = 100, T = 1s
    // s2: 1 turn, load = 300, T = 3s
    // mean_load = 200; T̃_1 = 1 * 200/100 = 2; T̃_2 = 3 * 200/300 = 2
    // Mean T̃ = 2.0
    const jsonl = [
      rec('s1', 0, { isl: 90, osl: 10, ttft_ms: 500, latency_ms: 1000 }),
      rec('s2', 0, { isl: 270, osl: 30, ttft_ms: 500, latency_ms: 3000 }),
    ].join('\n');
    const out = computeDerivedFromBlob(jsonl);
    expect(out.normalized_session_time_s).toBeCloseTo(2, 6);
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
    expect(out.normalized_session_time_s).toBeCloseTo(1, 6);
    expect(out.p90_prefill_tps_per_user).toBeCloseTo(200, 6);
  });

  it('p90 across turns: 10-turn session picks the right rank', () => {
    // Prefill rates 100..1000 (per turn isl/ttft); p90 of 10 values (linear) = 910.
    const turns = Array.from({ length: 10 }, (_, i) =>
      rec('s1', i, {
        isl: (i + 1) * 100, // 100, 200, ..., 1000 tokens
        osl: 10,
        ttft_ms: 1000, // 1 second → rates: 100..1000 tps
        latency_ms: 1500,
      }),
    );
    const out = computeDerivedFromBlob(turns.join('\n'));
    expect(out.p90_prefill_tps_per_user).toBeCloseTo(910, 6);
  });

  it('excludes osl=0 (cancelled/empty-output) turns from normalized E2E', () => {
    // Two normal turns + one cancelled turn (osl=0, latency=30s, ttft=1s).
    //
    // The cancelled turn must be excluded because observedDecodeIntervals collapses
    // to max(0-1,1)=1, making itlMs=(30000-1000)/1=29000ms and normalizedMs explode
    // to ~11 572 s — roughly 386× the real scale. (Pre-fix behavior for reference;
    // this number is intentionally not asserted below to avoid enshrining the bug.)
    //
    // Normal turn A: isl=100, osl=50, ttft=500ms, latency=1000ms
    //   observedDecodeIntervals = max(49,1) = 49
    //   itlMs = (1000-500)/49
    //   normalizedMs = 500 + 399*(500/49)
    //
    // Normal turn B: isl=200, osl=100, ttft=1000ms, latency=3000ms
    //   observedDecodeIntervals = max(99,1) = 99
    //   itlMs = (3000-1000)/99
    //   normalizedMs = 1000 + 399*(2000/99)
    const normA = (500 + (399 * 500) / 49) / 1000; // seconds
    const normB = (1000 + (399 * 2000) / 99) / 1000; // seconds

    const jsonl = [
      rec('s1', 0, { isl: 100, osl: 50, ttft_ms: 500, latency_ms: 1000 }),
      rec('s1', 1, { isl: 200, osl: 100, ttft_ms: 1000, latency_ms: 3000 }),
      // Cancelled / empty-output turn — osl=0 must be rejected by extractTurn.
      rec('s2', 0, { isl: 150, osl: 0, ttft_ms: 1000, latency_ms: 30000 }),
    ].join('\n');

    const out = computeDerivedFromBlob(jsonl);

    // Only the 2 normal turns contribute; osl=0 record is silently excluded.
    expect(out.normalized_e2e_400?.n).toBe(2);

    // p90 of [normA, normB] sorted ascending (normA < normB):
    // pos = 1*0.9 = 0.9; result = normA + (normB - normA)*0.9
    const expectedP90 = normA + (normB - normA) * 0.9;
    expect(out.normalized_e2e_400?.p90).toBeCloseTo(expectedP90, 6);

    // Sanity: p90 should be single-digit seconds, not thousands.
    expect(out.normalized_e2e_400!.p90).toBeLessThan(20);
  });
});
