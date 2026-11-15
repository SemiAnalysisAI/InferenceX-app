import { describe, expect, it } from 'vitest';

import { slaAttemptsFromExport } from '@semianalysisai/inferencex-db/etl/sla-attempts';

import {
  evaluateSlaAttemptsBlob,
  isSlaPointEvaluation,
  parseSlaLatencyTargets,
  SLA_TARGET_ERRORS,
  slaLatencyTargetsQuery,
} from './evaluation';

function parse(query: string) {
  return parseSlaLatencyTargets(new URLSearchParams(query));
}

function line(sessionNum: number, ttftMs: number, error: unknown = null): string {
  return JSON.stringify({
    metadata: {
      session_num: sessionNum,
      benchmark_phase: 'profiling',
      request_start_ns: 1e9 * sessionNum,
      request_end_ns: 1e9 * (sessionNum + 2),
    },
    metrics: error
      ? {}
      : {
          time_to_first_token: { value: ttftMs, unit: 'ms' },
          inter_token_latency: { value: 20, unit: 'ms' },
          request_latency: { value: 2000, unit: 'ms' },
          output_sequence_length: { value: 100, unit: 'tokens' },
        },
    error,
  });
}

describe('parseSlaLatencyTargets', () => {
  it('uses values exactly as written, without rounding', () => {
    expect(parse('ttft=737.45&tpot=49.999')).toEqual({
      targets: { maxTtftMs: 737.45, maxTpotMs: 49.999, maxE2eS: null },
    });
    expect(parse('ttft=1000&tpot=50&e2e=12.5')).toEqual({
      targets: { maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: 12.5 },
    });
  });

  it('leaves the end-to-end target off when it is absent, empty or "off"', () => {
    for (const query of ['ttft=1&tpot=1', 'ttft=1&tpot=1&e2e=', 'ttft=1&tpot=1&e2e=off']) {
      expect(parse(query)).toEqual({ targets: { maxTtftMs: 1, maxTpotMs: 1, maxE2eS: null } });
    }
  });

  it('rejects a target it cannot evaluate with a message instead of replacing it', () => {
    expect(parse('tpot=50')).toEqual({ error: SLA_TARGET_ERRORS.ttft });
    expect(parse('ttft=abc&tpot=50')).toEqual({ error: SLA_TARGET_ERRORS.ttft });
    expect(parse('ttft=0&tpot=50')).toEqual({ error: SLA_TARGET_ERRORS.ttft });
    expect(parse('ttft=3600001&tpot=50')).toEqual({ error: SLA_TARGET_ERRORS.ttft });
    expect(parse('ttft=1000&tpot=-1')).toEqual({ error: SLA_TARGET_ERRORS.tpot });
    expect(parse('ttft=1000&tpot=50&e2e=soon')).toEqual({ error: SLA_TARGET_ERRORS.e2e });
    expect(parse('ttft=1000&tpot=50&e2e=0')).toEqual({ error: SLA_TARGET_ERRORS.e2e });
  });

  it('round-trips through the query the client sends', () => {
    const targets = { maxTtftMs: 737.45, maxTpotMs: 50, maxE2eS: 30 };
    expect(parse(slaLatencyTargetsQuery(targets))).toEqual({ targets });
    expect(slaLatencyTargetsQuery({ ...targets, maxE2eS: null })).toBe('ttft=737.45&tpot=50');
  });
});

describe('evaluateSlaAttemptsBlob', () => {
  it('returns counts and accounting, not attempt records', async () => {
    const blob = await slaAttemptsFromExport([
      line(0, 300),
      line(1, 900),
      line(2, 1500),
      line(3, 0, { code: 503, type: 'Service Unavailable' }),
    ]);
    const evaluation = evaluateSlaAttemptsBlob(blob, {
      maxTtftMs: 1000,
      maxTpotMs: 50,
      maxE2eS: null,
    });
    expect(evaluation.counts).toMatchObject({ passing: 2, notPassing: 2, indeterminate: 0 });
    expect(evaluation.accounting).toMatchObject({
      attempted: 4,
      completed: 3,
      failed: 1,
      failureClasses: { http_503: 1 },
      reason: 'dispatch_count_unavailable',
    });
    expect(evaluation.source.kind).toBe('original_export');
    expect(JSON.stringify(evaluation)).not.toContain('ttftUs');
    expect(isSlaPointEvaluation(evaluation)).toBe(true);
    expect(isSlaPointEvaluation({ unavailable: 'no_request_level_data' })).toBe(false);
    expect(isSlaPointEvaluation(undefined)).toBe(false);
  });

  it('evaluates a target between two measured values exactly', async () => {
    const blob = await slaAttemptsFromExport([line(0, 737.4), line(1, 737.5), line(2, 737.6)]);
    const passing = (maxTtftMs: number) =>
      evaluateSlaAttemptsBlob(blob, { maxTtftMs, maxTpotMs: 50, maxE2eS: null }).counts.passing;
    expect([737.39, 737.4, 737.45, 737.5, 737.6].map(passing)).toEqual([0, 1, 1, 2, 3]);
  });
});
