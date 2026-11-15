import { describe, expect, it } from 'vitest';

import {
  costPer1kCompliantUsd,
  evaluateSlaAttempts,
  evaluateSlaConfig,
  evaluateSlaPoint,
  isValidSlaLatencyTargets,
  minimumSampleSize,
  observeSlaPoint,
  qualifySlaPoint,
  rankQualifying,
  reconcileSlaAccounting,
  SLA_ACCOUNTING_POLICY,
  SLA_ACCOUNTING_POLICY_VERSION,
  SLA_EXAMPLE_TARGETS,
  SLA_SAMPLE_POLICY,
  slaAccountingPolicyKey,
  slaAttemptSet,
  slaLatencyTargetsKey,
  slaWindow,
  smallSampleSize,
  windowCostUsd,
  type SlaAccountingInput,
  type SlaAccountingPolicy,
  type SlaAttemptRecord,
  type SlaLatencyTargets,
  type SlaPointInput,
  type SlaWindowTimings,
} from './sla-targets';

const TARGETS: SlaLatencyTargets = { maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: null };
/** A one-hour dispatch window with a 30 s grace period, as an AgentX point reports it. */
const HOUR: SlaWindowTimings = {
  configuredWindowS: 3600,
  graceS: 30,
  phaseElapsedS: 3630,
  clientDurationS: 3585.26,
  attemptSpanS: 3590.1,
  cutoffReached: true,
};

function completed(ttftMs: number | null, tpotMs: number | null, e2eS = 10): SlaAttemptRecord {
  return { outcome: 'completed', ttftMs, tpotMs, e2eS, outputTokens: 200 };
}

function failed(failureClass: string | null, ttftMs: number | null = null): SlaAttemptRecord {
  return { outcome: 'failed', failureClass, ttftMs, tpotMs: null, e2eS: 2, outputTokens: null };
}

function repeat(record: SlaAttemptRecord, count: number): SlaAttemptRecord[] {
  return Array.from({ length: count }, () => record);
}

function accountingInput(overrides: Partial<SlaAccountingInput> = {}): SlaAccountingInput {
  return {
    issued: null,
    issuedLowerBound: null,
    skippedBeforeDispatch: 0,
    incompleteAtCutoff: 0,
    contextOverflowRejected: 0,
    warmupExcluded: 0,
    retryAccounting: 'no_client_retries',
    outcomeSource: 'explicit',
    timings: HOUR,
    ...overrides,
  };
}

/** A measured point whose issued count equals its records unless overridden. */
function measured(
  load: number,
  records: SlaAttemptRecord[],
  overrides: Partial<SlaAccountingInput> = {},
  policy: SlaAccountingPolicy = SLA_ACCOUNTING_POLICY,
): SlaPointInput {
  const set = slaAttemptSet(records);
  const accounting = reconcileSlaAccounting(
    set,
    accountingInput({
      issued: records.length + (overrides.incompleteAtCutoff ?? 0),
      ...overrides,
    }),
    policy,
  );
  return {
    load: { kind: 'agentx_users', value: load },
    data: { kind: 'measured', accounting, counts: evaluateSlaAttempts(set, accounting, TARGETS) },
    cost: { gpuHourUsd: 2, gpuCount: 8 },
  };
}

const PASS = completed(400, 20);
const SLOW_TTFT = completed(1500, 20);
const SLOW_TPOT = completed(400, 80);

/** Verdict at 99% for 1,000 attempts of which `passing` pass. */
function statusWithPassing(passing: number): string {
  return evaluateSlaPoint(
    measured(2, [...repeat(PASS, passing), ...repeat(SLOW_TTFT, 1000 - passing)]),
    0.99,
  ).qualification.status;
}

function namedRow(name: string, points: SlaPointInput[]) {
  return { name, result: evaluateSlaConfig(points, 0.99) };
}

describe('attempt outcomes', () => {
  it('treats a stream that produced a first token and then failed as a failed attempt', () => {
    const set = slaAttemptSet([...repeat(PASS, 9), failed('ConnectionResetError', 300)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 10 }));
    const counts = evaluateSlaAttempts(set, accounting, TARGETS);
    expect(accounting.failed).toBe(1);
    expect(accounting.failureClasses).toEqual({ ConnectionResetError: 1 });
    expect(counts).toMatchObject({ passing: 9, notPassing: 1, indeterminate: 0 });
  });

  it('reports a completed attempt with a missing latency as missing telemetry, not as a failure', () => {
    const set = slaAttemptSet([...repeat(PASS, 8), completed(null, 20), completed(null, 90)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 10 }));
    expect(accounting.completed).toBe(10);
    expect(accounting.failed).toBe(0);
    // Default policy: eligible, not passing, and counted under missing telemetry.
    expect(evaluateSlaAttempts(set, accounting, TARGETS)).toMatchObject({
      passing: 8,
      notPassing: 2,
      indeterminate: 0,
      missingTelemetry: 2,
    });
    // Alternative policy: a missing value with nothing exceeded is unknown, an exceeded TPOT still fails.
    const lenient = reconcileSlaAccounting(set, accountingInput({ issued: 10 }), {
      ...SLA_ACCOUNTING_POLICY,
      missingTelemetry: 'indeterminate',
    });
    expect(evaluateSlaAttempts(set, lenient, TARGETS)).toMatchObject({
      passing: 8,
      notPassing: 1,
      indeterminate: 1,
      missingTelemetry: 2,
    });
  });

  it('keeps cancelled attempts in the denominator and never passes them', () => {
    const cancelled: SlaAttemptRecord = { ...PASS, outcome: 'cancelled' };
    const set = slaAttemptSet([...repeat(PASS, 3), cancelled]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 4 }));
    expect(accounting.cancelled).toBe(1);
    expect(evaluateSlaAttempts(set, accounting, TARGETS)).toMatchObject({
      passing: 3,
      notPassing: 1,
    });
  });

  it('does not apply the TPOT target to a completed attempt with one output token', () => {
    const single: SlaAttemptRecord = { ...completed(400, null), outputTokens: 1 };
    const set = slaAttemptSet([single]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 1 }));
    expect(evaluateSlaAttempts(set, accounting, TARGETS)).toMatchObject({
      passing: 1,
      missingTelemetry: 0,
    });
  });
});

describe('attempt accounting', () => {
  it('reconciles issued requests against every outcome class', () => {
    // 110 issued: 7 dropped before dispatch, 3 rejected for context overflow, 100 eligible.
    // Of those: 90 completed, 4 failed, 1 cancelled, 3 in flight at the cutoff, 2 with no trace.
    const records = [
      ...repeat(PASS, 90),
      ...repeat(failed('http_503'), 3),
      failed(null),
      { ...PASS, outcome: 'cancelled' as const },
    ];
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(records),
      accountingInput({
        issued: 110,
        skippedBeforeDispatch: 7,
        contextOverflowRejected: 3,
        incompleteAtCutoff: 3,
        warmupExcluded: 40,
      }),
    );
    expect(accounting).toMatchObject({
      issued: 110,
      dispatched: 100,
      attempted: 100,
      completed: 90,
      failed: 4,
      cancelled: 1,
      incomplete: 3,
      unknown: 2,
      failureClasses: { http_503: 3, unclassified: 1 },
      skippedBeforeDispatch: 7,
      contextOverflowRejected: 3,
      warmupExcluded: 40,
      completeness: 'partial',
      reason: 'outcomes_unknown',
      populationEstablished: true,
    });
    expect(accounting.policy.version).toBe(SLA_ACCOUNTING_POLICY_VERSION);
    const { completed: done, failed: bad, cancelled, incomplete, unknown } = accounting;
    expect(done + bad + cancelled + incomplete + unknown).toBe(accounting.dispatched);
  });

  it('is complete when every issued request is accounted for', () => {
    // The 1-lane AgentX point of run 43561310271: 154 issued, 153 records, 1 cancelled at the cutoff.
    const accounting = reconcileSlaAccounting(
      slaAttemptSet([...repeat(PASS, 152), failed('InvalidInferenceResultError')]),
      accountingInput({ issued: 154, incompleteAtCutoff: 1 }),
    );
    expect(accounting).toMatchObject({
      dispatched: 154,
      attempted: 154,
      completed: 152,
      failed: 1,
      incomplete: 1,
      unknown: 0,
      completeness: 'complete',
      reason: 'reconciled',
      populationEstablished: true,
    });
  });

  it('counts attempts in flight at the cutoff as not passing, with the bound reported', () => {
    const point = measured(384, repeat(PASS, 970), { incompleteAtCutoff: 30 });
    const { observed } = evaluateSlaPoint(point, 0.99);
    expect(observed).toMatchObject({
      attempted: 1000,
      passing: 970,
      notPassing: 30,
      indeterminate: 0,
    });
    expect(observed?.attainment).toBeCloseTo(0.97, 12);
    expect(observed?.attainmentExcludingIncomplete).toBe(1);
    expect(evaluateSlaPoint(point, 0.99).qualification.status).toBe('misses');
  });

  it('can instead hold attempts in flight at the cutoff as indeterminate', () => {
    const policy: SlaAccountingPolicy = {
      ...SLA_ACCOUNTING_POLICY,
      incompleteAtCutoff: 'indeterminate',
    };
    const point = measured(384, repeat(PASS, 970), { incompleteAtCutoff: 30 }, policy);
    const result = evaluateSlaPoint(point, 0.99);
    expect(result.observed).toMatchObject({ passing: 970, notPassing: 0, indeterminate: 30 });
    expect(result.observed?.attainmentUpper).toBe(1);
    expect(result.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'outcomes_unresolved',
    });
  });

  it('reports context-overflow rejections outside the denominator and flags a high share', () => {
    const few = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 995)),
      accountingInput({ issued: 1000, contextOverflowRejected: 5 }),
    );
    expect(few).toMatchObject({
      dispatched: 995,
      attempted: 995,
      failed: 0,
      contextOverflowRejected: 5,
      contextOverflowOverLimit: false,
      reason: 'reconciled',
    });
    const many = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 980)),
      accountingInput({ issued: 1000, contextOverflowRejected: 20 }),
    );
    expect(many.contextOverflowOverLimit).toBe(true);
  });

  it('can instead count context-overflow rejections as failed attempts', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 995)),
      accountingInput({ issued: 1000, contextOverflowRejected: 5 }),
      { ...SLA_ACCOUNTING_POLICY, contextOverflow: 'failed_attempt' },
    );
    expect(accounting).toMatchObject({
      dispatched: 1000,
      attempted: 1000,
      failed: 5,
      failureClasses: { context_overflow: 5 },
      reason: 'reconciled',
    });
  });

  it('tracks requests dropped before dispatch separately, never as attempts', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 200)),
      accountingInput({ issued: 205, skippedBeforeDispatch: 5 }),
    );
    expect(accounting).toMatchObject({
      issued: 205,
      dispatched: 200,
      attempted: 200,
      skippedBeforeDispatch: 5,
      reason: 'reconciled',
    });
  });

  it('has only a lower bound without an issued count', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 500)),
      accountingInput({ issuedLowerBound: 512, incompleteAtCutoff: null }),
    );
    expect(accounting).toMatchObject({
      issued: null,
      issuedLowerBound: 512,
      dispatched: null,
      attempted: 500,
      completeness: 'partial',
      reason: 'dispatch_count_unavailable',
      populationEstablished: false,
    });
  });

  it('is unknown when outcomes were inferred rather than recorded', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 500)),
      accountingInput({ issued: 500, outcomeSource: 'inferred' }),
    );
    expect(accounting).toMatchObject({
      completeness: 'unknown',
      reason: 'outcomes_not_explicit',
      populationEstablished: false,
    });
  });

  it('flags more records than issued requests instead of trusting either number', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 12)),
      accountingInput({ issued: 10 }),
    );
    expect(accounting).toMatchObject({
      dispatched: null,
      attempted: 12,
      completeness: 'unknown',
      reason: 'records_exceed_dispatched',
      populationEstablished: false,
    });
  });

  it('reports no attempt records as unknown accounting', () => {
    const accounting = reconcileSlaAccounting(slaAttemptSet([]), accountingInput());
    expect(accounting).toMatchObject({ completeness: 'unknown', reason: 'no_attempt_records' });
  });

  it('keeps warmup and retry accounting beside the attempt counts', () => {
    const accounting = reconcileSlaAccounting(
      slaAttemptSet(repeat(PASS, 200)),
      accountingInput({ issued: 200, warmupExcluded: 80, retryAccounting: 'unknown' }),
    );
    expect(accounting.attempted).toBe(200);
    expect(accounting.warmupExcluded).toBe(80);
    expect(accounting.retryAccounting).toBe('unknown');
  });
});

describe('accounting window', () => {
  it('uses the configured window and keeps every other duration beside it', () => {
    const window = slaWindow(HOUR, SLA_ACCOUNTING_POLICY);
    expect(window).toEqual({ ...HOUR, durationS: 3600, durationSource: 'configured_window' });
  });

  it('uses the phase elapsed time when the policy says so', () => {
    const window = slaWindow(HOUR, { ...SLA_ACCOUNTING_POLICY, timeBase: 'phase_elapsed' });
    expect(window).toMatchObject({ durationS: 3630, durationSource: 'phase_elapsed' });
  });

  it('names the source it fell back to when the export lacks the policy time base', () => {
    const spanOnly: SlaWindowTimings = {
      configuredWindowS: null,
      graceS: null,
      phaseElapsedS: null,
      clientDurationS: null,
      attemptSpanS: 3590.1,
      cutoffReached: null,
    };
    expect(slaWindow(spanOnly, SLA_ACCOUNTING_POLICY)).toMatchObject({
      durationS: 3590.1,
      durationSource: 'attempt_span',
    });
    expect(
      slaWindow({ ...spanOnly, clientDurationS: 3585.26 }, SLA_ACCOUNTING_POLICY),
    ).toMatchObject({ durationS: 3585.26, durationSource: 'client_reported' });
  });

  it('divides goodput and the achieved rate by the same window', () => {
    const { observed } = evaluateSlaPoint(
      measured(8, [...repeat(PASS, 900), ...repeat(SLOW_TTFT, 100)]),
      0.9,
    );
    expect(observed).toMatchObject({ durationS: 3600, durationSource: 'configured_window' });
    expect(observed?.goodputRps).toBeCloseTo(900 / 3600, 12);
    expect(observed?.completedRps).toBeCloseTo(1000 / 3600, 12);
  });

  it('gives every policy its own cache key', () => {
    expect(slaAccountingPolicyKey(SLA_ACCOUNTING_POLICY)).toBe(
      'v1;cutoff=not_passing;overflow=excluded@0.01;telemetry=not_passing;time=configured_window',
    );
    expect(
      slaAccountingPolicyKey({ ...SLA_ACCOUNTING_POLICY, timeBase: 'phase_elapsed' }),
    ).not.toBe(slaAccountingPolicyKey(SLA_ACCOUNTING_POLICY));
  });
});

describe('exact target evaluation', () => {
  it('passes a value equal to the target and fails the next microsecond', () => {
    const records = [
      completed(1000, 50),
      completed(1000.001, 50),
      completed(1000, 50.001),
      completed(999.999, 49.999),
    ];
    const set = slaAttemptSet(records);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 4 }));
    expect(evaluateSlaAttempts(set, accounting, TARGETS)).toMatchObject({
      passing: 2,
      notPassing: 2,
      withinTtft: 3,
      withinTpot: 3,
    });
  });

  it('evaluates a target that is not a round number as entered', () => {
    const set = slaAttemptSet([completed(737.4, 20), completed(737.5, 20), completed(737.6, 20)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 3 }));
    const at = (maxTtftMs: number) =>
      evaluateSlaAttempts(set, accounting, { ...TARGETS, maxTtftMs }).passing;
    expect(at(737.4)).toBe(1);
    expect(at(737.45)).toBe(1);
    expect(at(737.5)).toBe(2);
    expect(at(737.6)).toBe(3);
  });

  it('includes an attempt exactly on a decimal threshold despite binary conversion', () => {
    // 1.001 * 1e3 is 1000.9999999999999 in binary floating point; the attempt is at 1001 us.
    expect(1.001 * 1e3).toBeLessThan(1001);
    const set = slaAttemptSet([completed(1.001, 1.003, 0.001_005)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 1 }));
    const counts = (targets: SlaLatencyTargets) => evaluateSlaAttempts(set, accounting, targets);
    expect(counts({ maxTtftMs: 1.001, maxTpotMs: 1.003, maxE2eS: 0.001_005 })).toMatchObject({
      passing: 1,
      withinTtft: 1,
      withinTpot: 1,
      withinE2e: 1,
    });
    expect(counts({ maxTtftMs: 1.0009, maxTpotMs: 1.003, maxE2eS: null }).withinTtft).toBe(0);
  });

  it('applies the end-to-end target only when it is set, inclusive at the boundary', () => {
    const set = slaAttemptSet([completed(400, 20, 30), completed(400, 20, 30.000001)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 2 }));
    expect(evaluateSlaAttempts(set, accounting, TARGETS)).toMatchObject({
      passing: 2,
      withinE2e: null,
    });
    expect(evaluateSlaAttempts(set, accounting, { ...TARGETS, maxE2eS: 30 })).toMatchObject({
      passing: 1,
      withinE2e: 1,
    });
  });

  it('takes joint attainment per attempt, below both separate attainments', () => {
    // 100 attempts: 10 slow on TTFT only, 10 slow on TPOT only, 80 within both.
    const point = measured(8, [
      ...repeat(PASS, 80),
      ...repeat(SLOW_TTFT, 10),
      ...repeat(SLOW_TPOT, 10),
    ]);
    const { observed } = evaluateSlaPoint(point, 0.9);
    expect(observed?.ttftAttainment).toBeCloseTo(0.9, 12);
    expect(observed?.tpotAttainment).toBeCloseTo(0.9, 12);
    expect(observed?.attainment).toBeCloseTo(0.8, 12);
    // Each target alone reaches 90%, the joint target does not.
    expect(evaluateSlaPoint(point, 0.9).qualification.status).toBe('misses');
  });

  it('keys latency targets without rounding them', () => {
    expect(slaLatencyTargetsKey({ maxTtftMs: 737.45, maxTpotMs: 50, maxE2eS: null })).toBe(
      'ttft=737.45;tpot=50;e2e=off',
    );
    expect(slaLatencyTargetsKey({ maxTtftMs: 1000, maxTpotMs: 50, maxE2eS: 12.5 })).toBe(
      'ttft=1000;tpot=50;e2e=12.5',
    );
    expect(isValidSlaLatencyTargets(SLA_EXAMPLE_TARGETS)).toBe(true);
    expect(isValidSlaLatencyTargets({ maxTtftMs: 0, maxTpotMs: 50, maxE2eS: null })).toBe(false);
    expect(isValidSlaLatencyTargets({ maxTtftMs: 1, maxTpotMs: 50, maxE2eS: Number.NaN })).toBe(
      false,
    );
  });
});

describe('sample policy', () => {
  it('asks for enough attempts that one miss still meets the required attainment', () => {
    expect(minimumSampleSize(0.9)).toBe(100);
    expect(minimumSampleSize(0.99)).toBe(100);
    expect(minimumSampleSize(0.995)).toBe(200);
    expect(minimumSampleSize(0.999)).toBe(1000);
    expect(minimumSampleSize(0.9999)).toBe(10_000);
    expect(smallSampleSize(0.99)).toBe(1000);
    expect(smallSampleSize(0.5)).toBe(100);
  });

  it('is a configurable policy', () => {
    const strict = { ...SLA_SAMPLE_POLICY, absoluteMinimum: 500 };
    expect(minimumSampleSize(0.99, strict)).toBe(500);
    const point = measured(4, repeat(PASS, 300));
    expect(evaluateSlaPoint(point, 0.99).qualification.status).toBe('meets');
    expect(evaluateSlaPoint(point, 0.99, strict).qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'below_minimum_sample',
      minimumSample: 500,
    });
  });
});

describe('qualification', () => {
  it('keeps valid observed values when the sample is too small to qualify', () => {
    const result = evaluateSlaPoint(measured(1, repeat(PASS, 40)), 0.99);
    expect(result.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'below_minimum_sample',
      exploratory: false,
      minimumSample: 100,
    });
    expect(result.observed).toMatchObject({ attempted: 40, passing: 40, attainment: 1 });
    expect(result.observed?.goodputRps).toBeCloseTo(40 / 3600, 12);
    expect(result.costPer1kCompliantUsd).not.toBeNull();
  });

  it('flags a verdict on a small sample without changing it', () => {
    const result = evaluateSlaPoint(measured(1, repeat(PASS, 150)), 0.99);
    expect(result.qualification).toMatchObject({ status: 'meets', smallSample: true });
    const large = evaluateSlaPoint(measured(1, repeat(PASS, 1000)), 0.99);
    expect(large.qualification).toMatchObject({ status: 'meets', smallSample: false });
  });

  it('meets at exactly the required attainment and misses one attempt below', () => {
    expect(statusWithPassing(990)).toBe('meets');
    expect(statusWithPassing(989)).toBe('misses');
  });

  it('never reports "meets" when the attempt population is not established', () => {
    const result = evaluateSlaPoint(measured(16, repeat(PASS, 5000), { issued: null }), 0.99);
    expect(result.observed).toMatchObject({ attempted: 5000, passing: 5000, attainment: 1 });
    expect(result.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'attempt_population_not_established',
      exploratory: true,
    });
  });

  it('withholds a verdict that depends on attempts with an unknown outcome', () => {
    // 1,000 issued, 985 records that pass, 15 that nothing accounts for: 98.5% certain, 100% possible.
    const set = slaAttemptSet(repeat(PASS, 985));
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 1000 }));
    const observed = observeSlaPoint(accounting, evaluateSlaAttempts(set, accounting, TARGETS));
    expect(observed).toMatchObject({ passing: 985, notPassing: 0, indeterminate: 15 });
    expect(qualifySlaPoint(observed, accounting, 0.99)).toMatchObject({
      status: 'insufficient_data',
      reason: 'outcomes_unresolved',
      exploratory: false,
    });
    expect(qualifySlaPoint(observed, accounting, 0.98).status).toBe('meets');
  });

  it('misses when even the best case for unknown outcomes falls short', () => {
    const set = slaAttemptSet([...repeat(PASS, 900), ...repeat(SLOW_TPOT, 85)]);
    const accounting = reconcileSlaAccounting(set, accountingInput({ issued: 1000 }));
    const observed = observeSlaPoint(accounting, evaluateSlaAttempts(set, accounting, TARGETS));
    expect(observed.attainmentUpper).toBeCloseTo(0.915, 12);
    expect(qualifySlaPoint(observed, accounting, 0.99).status).toBe('misses');
  });

  it('separates a service failure from an invalid measurement and from missing data', () => {
    const load = { kind: 'agentx_users', value: 64 } as const;
    const crashed = evaluateSlaPoint(
      {
        load,
        data: { kind: 'excluded', category: 'service_failure', reason: 'server exited' },
        cost: null,
      },
      0.99,
    );
    expect(crashed.qualification).toMatchObject({ status: 'misses', reason: 'service_failure' });
    expect(crashed.exclusion).toEqual({ category: 'service_failure', reason: 'server exited' });
    expect(crashed.observed).toBeNull();

    const invalid = evaluateSlaPoint(
      {
        load,
        data: { kind: 'excluded', category: 'invalid_measurement', reason: 'client crashed' },
        cost: null,
      },
      0.99,
    );
    expect(invalid.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'invalid_measurement',
    });

    const unexplained = evaluateSlaPoint(
      {
        load,
        data: { kind: 'excluded', category: 'undetermined', reason: 'Slurm job ended FAILED' },
        cost: null,
      },
      0.99,
    );
    expect(unexplained.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'failure_undetermined',
    });

    const aggregateOnly = evaluateSlaPoint(
      {
        load: { kind: 'request_concurrency', value: 64 },
        data: { kind: 'unavailable', reason: 'no_request_level_data' },
        cost: null,
      },
      0.99,
    );
    expect(aggregateOnly.qualification).toMatchObject({
      status: 'insufficient_data',
      reason: 'no_request_level_data',
    });
    expect(aggregateOnly.exclusion).toBeNull();
  });
});

describe('cost', () => {
  it('charges every GPU for the whole accounting window', () => {
    // 8 GPUs at $2 per GPU-hour for one hour is $16, whatever share of the hour served requests.
    expect(windowCostUsd({ gpuHourUsd: 2, gpuCount: 8 }, 3600)).toBe(16);
    expect(costPer1kCompliantUsd({ gpuHourUsd: 2, gpuCount: 8 }, 3600, 1000)).toBe(16);
    expect(costPer1kCompliantUsd({ gpuHourUsd: 2, gpuCount: 8 }, 3600, 250)).toBe(64);
    expect(windowCostUsd({ gpuHourUsd: 2, gpuCount: 8 }, 1800)).toBe(8);
  });

  it('divides the window cost by passing attempts, not by completed ones', () => {
    const point = measured(8, [...repeat(PASS, 500), ...repeat(SLOW_TTFT, 500)]);
    const result = evaluateSlaPoint(point, 0.5);
    expect(result.observed?.completedRps).toBeCloseTo(1000 / 3600, 12);
    expect(result.windowCostUsd).toBe(16);
    expect(result.costPer1kCompliantUsd).toBe(32);
  });

  it('bills the configured window, not the request span or the grace period', () => {
    // The last attempts never finished, so the span is 3,590 s; the GPUs were still held for the hour.
    const result = evaluateSlaPoint(measured(1, repeat(PASS, 160)), 0.99);
    expect(result.observed?.durationS).toBe(3600);
    expect(result.windowCostUsd).toBe(16);
    expect(result.costPer1kCompliantUsd).toBe(100);
  });

  it('has no cost without a price, a GPU count, a window or a passing attempt', () => {
    expect(costPer1kCompliantUsd(null, 3600, 10)).toBeNull();
    expect(costPer1kCompliantUsd({ gpuHourUsd: 0, gpuCount: 8 }, 3600, 10)).toBeNull();
    expect(costPer1kCompliantUsd({ gpuHourUsd: 2, gpuCount: 0 }, 3600, 10)).toBeNull();
    expect(costPer1kCompliantUsd({ gpuHourUsd: 2, gpuCount: 8 }, 0, 10)).toBeNull();
    expect(costPer1kCompliantUsd({ gpuHourUsd: 2, gpuCount: 8 }, 3600, 0)).toBeNull();
  });
});

describe('configuration results', () => {
  it('reports the highest tested passing load literally when passing is not monotonic', () => {
    const result = evaluateSlaConfig(
      [
        measured(1, repeat(PASS, 200)),
        measured(2, [...repeat(PASS, 150), ...repeat(SLOW_TTFT, 50)]),
        measured(4, repeat(PASS, 400)),
        measured(8, [...repeat(PASS, 100), ...repeat(SLOW_TPOT, 700)]),
      ],
      0.99,
    );
    expect(result.points.map((point) => point.qualification.status)).toEqual([
      'meets',
      'misses',
      'meets',
      'misses',
    ]);
    expect(result.status).toBe('meets');
    expect(result.selections.highestPassingLoad).toBe(2);
    expect(result.lowerLoadMissed).toBe(true);
  });

  it('does not flag a lower miss when every lower load passes', () => {
    const result = evaluateSlaConfig(
      [measured(1, repeat(PASS, 200)), measured(2, repeat(PASS, 300))],
      0.99,
    );
    expect(result.lowerLoadMissed).toBe(false);
  });

  it('lets different points win on load, goodput and cost', () => {
    const result = evaluateSlaConfig(
      [
        // Most passing attempts: highest goodput and lowest cost.
        measured(16, repeat(PASS, 4000)),
        // Highest passing load, but fewer attempts finish at this load.
        measured(32, repeat(PASS, 3000)),
        // Highest goodput overall, but it misses the targets.
        measured(64, [...repeat(PASS, 5000), ...repeat(SLOW_TTFT, 1000)]),
      ],
      0.99,
    );
    expect(result.selections).toEqual({ highestPassingLoad: 1, highestGoodput: 0, lowestCost: 0 });
    expect(result.points[2].observed?.goodputRps).toBeGreaterThan(
      result.points[0].observed?.goodputRps ?? 0,
    );
    expect(result.points[2].qualification.status).toBe('misses');
  });

  it('picks the cheapest qualifying point by its own cost basis', () => {
    const cheap = { ...measured(8, repeat(PASS, 1000)), cost: { gpuHourUsd: 1, gpuCount: 1 } };
    const result = evaluateSlaConfig([measured(16, repeat(PASS, 4000)), cheap], 0.99);
    expect(result.selections).toMatchObject({ highestGoodput: 0, lowestCost: 1 });
  });

  it('is exploratory when the only observed values cannot support a verdict', () => {
    const result = evaluateSlaConfig(
      [
        measured(1, repeat(PASS, 500), { issued: null }),
        measured(2, repeat(PASS, 900), { issued: null }),
      ],
      0.99,
    );
    expect(result).toMatchObject({ status: 'insufficient_data', exploratory: true });
    expect(result.selections).toEqual({
      highestPassingLoad: null,
      highestGoodput: null,
      lowestCost: null,
    });
  });

  it('misses when a load is tested and none passes', () => {
    const result = evaluateSlaConfig(
      [measured(1, repeat(PASS, 20)), measured(2, repeat(SLOW_TTFT, 400))],
      0.99,
    );
    expect(result).toMatchObject({ status: 'misses', exploratory: false });
  });

  it('qualifies the configuration with higher attainment, not the one with more requests', () => {
    // A: 150 attempted req/s, 90% pass, 135 good req/s. B: 120 req/s, 99.5%, 119.4 good req/s.
    const timings: SlaWindowTimings = { ...HOUR, configuredWindowS: 100 };
    const a = evaluateSlaConfig(
      [measured(64, [...repeat(PASS, 13_500), ...repeat(SLOW_TTFT, 1500)], { timings })],
      0.99,
    );
    const b = evaluateSlaConfig(
      [measured(64, [...repeat(PASS, 11_940), ...repeat(SLOW_TTFT, 60)], { timings })],
      0.99,
    );
    expect(a.points[0].observed?.goodputRps).toBeCloseTo(135, 9);
    expect(b.points[0].observed?.goodputRps).toBeCloseTo(119.4, 9);
    expect(a.status).toBe('misses');
    expect(b.status).toBe('meets');
    const ranked = rankQualifying(
      [
        { name: 'A', result: a },
        { name: 'B', result: b },
      ],
      'goodput',
    );
    expect(ranked.map((row) => row.name)).toEqual(['B']);
  });
});

describe('ranking', () => {
  const rows = [
    namedRow('high-load', [measured(64, repeat(PASS, 2000))]),
    namedRow('exploratory', [measured(128, repeat(PASS, 9000), { issued: null })]),
    namedRow('cheap', [
      { ...measured(8, repeat(PASS, 1000)), cost: { gpuHourUsd: 1, gpuCount: 1 } },
    ]),
    namedRow('no-price', [{ ...measured(16, repeat(PASS, 6000)), cost: null }]),
    namedRow('misses', [measured(32, repeat(SLOW_TPOT, 3000))]),
  ];

  it('ranks qualifying configurations and leaves exploratory and missing ones out', () => {
    expect(rankQualifying(rows, 'cost').map((entry) => entry.name)).toEqual([
      'cheap',
      'high-load',
      'no-price',
    ]);
    expect(rankQualifying(rows, 'goodput').map((entry) => entry.name)).toEqual([
      'no-price',
      'high-load',
      'cheap',
    ]);
    expect(rankQualifying(rows, 'load').map((entry) => entry.name)).toEqual([
      'high-load',
      'no-price',
      'cheap',
    ]);
  });
});
