import { describe, expect, it } from 'vitest';

import {
  evaluateSlaAttempts,
  reconcileSlaAccounting,
  SLA_NOT_RECORDED,
  SLA_TPOT_NOT_APPLICABLE,
  type SlaLatencyTargets,
} from '@semianalysisai/inferencex-constants';

import {
  decodeSlaAttempts,
  encodeSlaAttempts,
  parseHarnessAggregate,
  parseHarnessPhaseLog,
  slaAttemptsFromExport,
  slaAttemptsFromTimeline,
  slaAttemptsSha256,
  slaFailureClass,
} from './sla-attempts';

const TARGETS: SlaLatencyTargets = { maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: null };
const INVALID_RESULT = {
  type: 'InvalidInferenceResultError',
  message: 'No responses with actual content were received from the server',
  cause_chain: ['InvalidInferenceResultError'],
};
const HTTP_503 = { code: 503, type: 'Service Unavailable', message: 'not ready to serve' };

/** A record shaped like one line of `profile_export.jsonl`. */
function record(
  sessionNum: number,
  options: {
    phase?: string | null;
    error?: Record<string, unknown> | null;
    ttftMs?: number | null;
    tpotMs?: number | null;
    latencyMs?: number | null;
    tokens?: number | null;
    endNs?: number | null;
    cancelled?: boolean;
  } = {},
): string {
  const { phase = 'profiling', error = null, tokens = 300 } = options;
  const ttftMs = options.ttftMs === undefined ? 700 : options.ttftMs;
  const tpotMs = options.tpotMs === undefined ? 17 : options.tpotMs;
  const latencyMs = options.latencyMs === undefined ? 24_000 : options.latencyMs;
  const startNs = 1_000_000_000_000 + sessionNum * 1_000_000_000;
  const metrics: Record<string, unknown> = {};
  if (ttftMs !== null) metrics.time_to_first_token = { value: ttftMs, unit: 'ms' };
  if (tpotMs !== null) metrics.inter_token_latency = { value: tpotMs, unit: 'ms' };
  if (latencyMs !== null) metrics.request_latency = { value: latencyMs, unit: 'ms' };
  if (tokens !== null) metrics.output_sequence_length = { value: tokens, unit: 'tokens' };
  return JSON.stringify({
    metadata: {
      session_num: sessionNum,
      ...(phase === null ? {} : { benchmark_phase: phase }),
      request_start_ns: startNs,
      request_ack_ns: startNs + 50_000_000,
      request_end_ns: options.endNs === undefined ? startNs + 24_000_000_000 : options.endNs,
      was_cancelled: options.cancelled === true,
    },
    metrics,
    error,
  });
}

/** The profiling-phase lines of a real `aiperf.log` (run 43561310271, 1 replay lane). */
const LOG_COMPLETE = `
2026-11-14 05:40:27.666 - PhaseRunner - NOTICE - Phase warmup (warmup) complete | completed=11, cancelled=0, errors=0 | sessions: completed=0, cancelled=0 | elapsed=97.65s
2026-11-14 05:40:27.774 - PhaseRunner - NOTICE - Phase profiling (profiling) started | phase_index=0 | profiling_index=0 | target: 3600.0s duration
2026-11-14 06:40:27.774 - PhaseRunner - NOTICE - Phase profiling (profiling) sending complete | sent=154, completed=153, in_flight=1 | sessions: sent=4, completed=3 | timeout_triggered=True
2026-11-14 06:40:27.774 - PhaseRunner - INFO - Waiting for event 'profiling phase credits returned' with timeout of 29.999515342999985s
2026-11-14 06:40:57.775 - PhaseRunner - WARNING - Phase profiling timed out, cancelling all credits. Stats: sent=154, completed=153, cancelled=0, in_flight=1
2026-11-14 06:40:57.776 - PhaseRunner - NOTICE - Phase profiling (profiling) complete | completed=153, cancelled=1, errors=0 | sessions: completed=3, cancelled=0 | elapsed=3630.00s | grace_period_timeout=True
`;

/** The same phase as the console prints it in `benchmark.log` (run 36463674051, 512 lanes). */
const LOG_CONSOLE = `
20:49:03.145 NOTICE   Phase profiling (profiling) started | phase_index=0 | profiling_index=0 | target: 3600.0s duration (runner.py:702)
21:49:03.146 NOTICE   Phase profiling (profiling) sending complete | sent=22,823, completed=22,021, in_flight=802 | sessions: sent=205, completed=120 | timeout_triggered=True (runner.py:896)
21:49:43.146 NOTICE   Phase profiling (profiling) complete | completed=22,393, cancelled=430, errors=0 | sessions: completed=201, cancelled=4 | elapsed=3640.00s | grace_period_timeout=True (runner.py:1162)
`;

/** A run the harness aborted on its failure threshold (run 40421997301, 256 lanes). */
const LOG_ABORTED = `
2026-10-27 01:53:08.531 - PhaseRunner - NOTICE - Phase profiling (profiling) started | phase_index=0 | profiling_index=0 | target: 3600.0s duration
2026-10-27 01:58:23.790 - system_controller - WARNING - Run aborted (failed_request_threshold): 234/2337 profiling requests failed (10.0%), exceeding the --failed-request-threshold limit of 10.0%. Check inference server logs. Will exit non-zero.
`;

describe('parseHarnessPhaseLog', () => {
  it('reads the issued, completed and cancelled counts and the phase timing', () => {
    expect(parseHarnessPhaseLog(LOG_COMPLETE)).toEqual({
      configuredWindowS: 3600,
      graceS: 30,
      sent: 154,
      inFlightAtWindowEnd: 1,
      completed: 153,
      cancelled: 1,
      elapsedS: 3630,
      gracePeriodTimeout: true,
      phaseCompleted: true,
      abortReason: null,
    });
  });

  it('reads the console format with thousands separators', () => {
    expect(parseHarnessPhaseLog(LOG_CONSOLE)).toMatchObject({
      configuredWindowS: 3600,
      sent: 22_823,
      inFlightAtWindowEnd: 802,
      completed: 22_393,
      cancelled: 430,
      elapsedS: 3640,
      phaseCompleted: true,
    });
  });

  it('reports an aborted run with the reason the harness gave and no issued count', () => {
    expect(parseHarnessPhaseLog(LOG_ABORTED)).toMatchObject({
      sent: null,
      cancelled: null,
      phaseCompleted: false,
      abortReason:
        '(failed_request_threshold): 234/2337 profiling requests failed (10.0%), exceeding the --failed-request-threshold limit of 10.0%.',
    });
  });
});

describe('parseHarnessAggregate', () => {
  it('reads the overflow count, the client duration and the cancel flag', () => {
    expect(
      parseHarnessAggregate({
        context_overflow_count: { unit: 'requests', avg: 3 },
        benchmark_duration: { unit: 'sec', avg: 3585.2552 },
        was_cancelled: false,
      }),
    ).toEqual({ contextOverflowCount: 3, benchmarkDurationS: 3585.2552, wasCancelled: false });
  });

  it('reports a field the export does not carry as null, not as zero', () => {
    expect(parseHarnessAggregate({ request_count: { avg: 10 } })).toEqual({
      contextOverflowCount: null,
      benchmarkDurationS: null,
      wasCancelled: null,
    });
  });
});

describe('slaFailureClass', () => {
  it('keeps the HTTP status of a server rejection and the class of an exception', () => {
    expect(slaFailureClass(HTTP_503)).toBe('http_503');
    expect(slaFailureClass(INVALID_RESULT)).toBe('InvalidInferenceResultError');
    expect(slaFailureClass({ type: 'ClientConnectorError', cause_chain: ['OSError'] })).toBe(
      'ClientConnectorError',
    );
    expect(slaFailureClass({})).toBe('unclassified');
  });

  it('does not read the code of a harness-side error as an HTTP status', () => {
    expect(slaFailureClass({ type: 'SomeHarnessError', code: 500, cause_chain: ['X'] })).toBe(
      'SomeHarnessError',
    );
  });
});

describe('slaAttemptsFromExport', () => {
  it('reconciles a completed run exactly against the harness log', async () => {
    // 154 issued: 152 completed, 1 explicit failure, 1 still in flight at the cutoff (no record).
    const lines = [
      ...Array.from({ length: 11 }, (_, index) =>
        record(index, { phase: 'warmup', error: INVALID_RESULT }),
      ),
      ...Array.from({ length: 152 }, (_, index) => record(index)),
      record(152, { error: INVALID_RESULT, ttftMs: null, tpotMs: null, latencyMs: null }),
    ];
    const blob = await slaAttemptsFromExport(lines, {
      harnessLog: LOG_COMPLETE,
      aggregate: { context_overflow_count: { avg: 0 }, benchmark_duration: { avg: 3585.26 } },
    });
    expect(blob.source).toMatchObject({ kind: 'original_export', harnessLog: 'complete' });
    expect(blob.accounting).toMatchObject({
      issued: 154,
      issuedLowerBound: 153,
      incompleteAtCutoff: 1,
      contextOverflowRejected: 0,
      skippedBeforeDispatch: 0,
      warmupExcluded: 11,
      retryAccounting: 'no_client_retries',
      outcomeSource: 'explicit',
    });
    expect(blob.accounting.timings).toMatchObject({
      configuredWindowS: 3600,
      graceS: 30,
      phaseElapsedS: 3630,
      clientDurationS: 3585.26,
      cutoffReached: true,
    });
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({
      dispatched: 154,
      completed: 152,
      failed: 1,
      incomplete: 1,
      unknown: 0,
      failureClasses: { InvalidInferenceResultError: 1 },
      completeness: 'complete',
      reason: 'reconciled',
    });
    expect(accounting.window).toMatchObject({
      durationS: 3600,
      durationSource: 'configured_window',
    });
  });

  it('gives only a lower bound when the harness log is not available', async () => {
    // Ids 0..9 with 4 and 7 missing: two attempts left no record, and any above 9 are invisible.
    const lines = [0, 1, 2, 3, 5, 6, 8, 9].map((id) => record(id));
    const blob = await slaAttemptsFromExport(lines);
    expect(blob.source).toMatchObject({ harnessLog: 'absent', sequenceGaps: 2 });
    expect(blob.accounting).toMatchObject({
      issued: null,
      issuedLowerBound: 10,
      incompleteAtCutoff: null,
      contextOverflowRejected: null,
    });
    expect(reconcileSlaAccounting(blob.set, blob.accounting)).toMatchObject({
      attempted: 8,
      completeness: 'partial',
      reason: 'dispatch_count_unavailable',
      populationEstablished: false,
    });
    expect(blob.accounting.timings).toMatchObject({ configuredWindowS: null, attemptSpanS: 33 });
  });

  it('keeps a partial stream that then failed as a failed attempt, whatever it measured', async () => {
    const lines = [
      record(0),
      // The stream delivered a first token within the target and then broke.
      record(1, {
        error: { type: 'SSEResponseError', cause_chain: ['SSEResponseError'] },
        ttftMs: 200,
      }),
      record(2, { error: HTTP_503, ttftMs: null, tpotMs: null, latencyMs: null }),
    ];
    const blob = await slaAttemptsFromExport(lines);
    expect(blob.set.completed.ttftUs).toEqual([700_000]);
    expect(blob.set.other).toEqual([
      { outcome: 'failed', failureClass: 'SSEResponseError', count: 1 },
      { outcome: 'failed', failureClass: 'http_503', count: 1 },
    ]);
  });

  it('treats a record without an end timestamp or a latency as incomplete', async () => {
    const blob = await slaAttemptsFromExport([
      record(0),
      record(1, { latencyMs: null, endNs: null }),
    ]);
    expect(blob.set.completed.ttftUs).toHaveLength(1);
    expect(blob.set.other).toEqual([{ outcome: 'incomplete', failureClass: null, count: 1 }]);
  });

  it('keeps a completed record with missing telemetry as completed, not as a failure', async () => {
    const blob = await slaAttemptsFromExport(
      [
        record(0),
        // The stream ended without usage: no token count and no per-token latency.
        record(1, { tokens: null, tpotMs: null }),
        // A single output token: TPOT does not apply.
        record(2, { tokens: 1, tpotMs: null }),
        record(3, { ttftMs: null }),
      ],
      {
        harnessLog: LOG_COMPLETE.replace('sent=154', 'sent=4').replace(
          'cancelled=1,',
          'cancelled=0,',
        ),
      },
    );
    expect(blob.set.other).toEqual([]);
    expect(blob.set.completed.ttftUs).toEqual([SLA_NOT_RECORDED, 700_000, 700_000, 700_000]);
    expect(blob.set.completed.tpotUs).toEqual([
      17_000,
      SLA_TPOT_NOT_APPLICABLE,
      SLA_NOT_RECORDED,
      17_000,
    ]);
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({ completed: 4, failed: 0, reason: 'reconciled' });
    expect(evaluateSlaAttempts(blob.set, accounting, TARGETS)).toMatchObject({
      passing: 2,
      notPassing: 2,
      missingTelemetry: 2,
    });
  });

  it('counts a request the harness dropped before dispatch separately, never as an attempt', async () => {
    const lines = [
      record(0),
      record(1, { error: { type: 'CreditProcessingError', code: 500 }, latencyMs: null }),
      record(2),
    ];
    const blob = await slaAttemptsFromExport(lines, {
      harnessLog: LOG_COMPLETE.replace('sent=154', 'sent=3').replace(
        'cancelled=1,',
        'cancelled=0,',
      ),
    });
    expect(blob.accounting.skippedBeforeDispatch).toBe(1);
    expect(reconcileSlaAccounting(blob.set, blob.accounting)).toMatchObject({
      issued: 3,
      dispatched: 2,
      attempted: 2,
      failed: 0,
      reason: 'reconciled',
    });
  });

  it('marks a deliberately cancelled request as cancelled', async () => {
    const blob = await slaAttemptsFromExport([
      record(0, { error: { type: 'RequestCancellationError', code: 499 }, cancelled: true }),
    ]);
    expect(blob.set.other).toEqual([{ outcome: 'cancelled', failureClass: null, count: 1 }]);
  });

  it('turns issued requests that nothing accounts for into unknown outcomes', async () => {
    // The log says 154 were issued and 1 cancelled, but only 150 records exist.
    const blob = await slaAttemptsFromExport(
      Array.from({ length: 150 }, (_, index) => record(index)),
      { harnessLog: LOG_COMPLETE },
    );
    expect(reconcileSlaAccounting(blob.set, blob.accounting)).toMatchObject({
      attempted: 154,
      completed: 150,
      incomplete: 1,
      unknown: 3,
      completeness: 'partial',
      reason: 'outcomes_unknown',
    });
  });

  it('does not take an issued count from an aborted run', async () => {
    const blob = await slaAttemptsFromExport([record(0), record(1, { error: HTTP_503 })], {
      harnessLog: LOG_ABORTED,
    });
    expect(blob.source).toMatchObject({ harnessLog: 'aborted' });
    expect(blob.source.abortReason).toContain('failed_request_threshold');
    expect(blob.accounting).toMatchObject({ issued: null, incompleteAtCutoff: null });
  });

  it('counts lines that are not JSON instead of dropping them silently', async () => {
    const blob = await slaAttemptsFromExport([record(0), '{"metadata": {"session_num": 1', '']);
    expect(blob.source.unparsedLines).toBe(1);
  });

  it('converts latencies to whole microseconds without touching the unit of a target', async () => {
    const blob = await slaAttemptsFromExport([
      record(0, {
        ttftMs: 710.586633,
        tpotMs: 17.148545650549448,
        latencyMs: 24_118.351446,
        tokens: 1366,
      }),
    ]);
    expect(blob.set.completed).toEqual({
      ttftUs: [710_587],
      tpotUs: [17_149],
      e2eUs: [24_118_351],
    });
  });
});

describe('slaAttemptsFromTimeline', () => {
  it('yields inferred outcomes that can never establish the attempt population', () => {
    const blob = slaAttemptsFromTimeline([
      {
        phase: 'warmup',
        startUs: 0,
        endUs: 5,
        ttftMs: 1,
        tpotMs: 1,
        outputTokens: 1,
        cancelled: false,
      },
      {
        phase: 'profiling',
        startUs: 1_000_000,
        endUs: 9_000_000,
        ttftMs: 700,
        tpotMs: 20,
        outputTokens: 300,
        cancelled: false,
      },
      // No TTFT: a failure or missing telemetry; the timeline cannot say which.
      {
        phase: 'profiling',
        startUs: 2_000_000,
        endUs: 3_000_000,
        ttftMs: null,
        tpotMs: null,
        outputTokens: null,
        cancelled: false,
      },
    ]);
    expect(blob.source.kind).toBe('derived_timeline');
    expect(blob.set.other).toEqual([{ outcome: 'unknown', failureClass: null, count: 1 }]);
    expect(blob.set.completed.e2eUs).toEqual([8_000_000]);
    expect(blob.accounting.warmupExcluded).toBe(1);
    const accounting = reconcileSlaAccounting(blob.set, blob.accounting);
    expect(accounting).toMatchObject({
      attempted: 2,
      failed: 0,
      unknown: 1,
      completeness: 'unknown',
      reason: 'outcomes_not_explicit',
      populationEstablished: false,
    });
    expect(accounting.window).toMatchObject({ durationS: 8, durationSource: 'attempt_span' });
  });
});

describe('codec', () => {
  it('round-trips a blob and gives the same bytes and hash for the same attempts in any order', async () => {
    const lines = [
      record(0, { ttftMs: 900 }),
      record(1, { ttftMs: 300 }),
      record(2, { error: HTTP_503 }),
    ];
    const first = encodeSlaAttempts(await slaAttemptsFromExport(lines));
    const second = encodeSlaAttempts(await slaAttemptsFromExport(lines.toReversed()));
    expect(decodeSlaAttempts(first).set.completed.ttftUs).toEqual([300_000, 900_000]);
    expect(slaAttemptsSha256(first)).toBe(slaAttemptsSha256(second));
    expect(slaAttemptsSha256(first)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
