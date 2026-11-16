/**
 * SLA Targets: evaluate the load points of a benchmark against service targets
 * a reader enters (max TTFT, max TPOT, optional max end-to-end latency and a
 * required attainment).
 *
 * Measurement contract:
 *
 * - The unit is one attempt: a request the load generator dispatched during
 *   the measurement phase. Warmup attempts are excluded and counted. Requests
 *   dropped before dispatch are counted separately and are never attempts.
 * - Every attempt has one explicit outcome: `completed`, `failed` (with the
 *   error class the client recorded), `cancelled`, `incomplete` (still in
 *   flight at the cutoff) or `unknown` (dispatched, no outcome recorded). An
 *   outcome is never derived from a latency value being present.
 * - Attainment is passing attempts over all eligible attempts. An attempt
 *   passes only when it completed and every enabled target holds for that same
 *   attempt. Failed and cancelled attempts never pass.
 * - Four judgment calls are fields of `SlaAccountingPolicy`, so each can be
 *   changed in one place: attempts in flight at the cutoff, requests rejected
 *   for context overflow, completed attempts with missing telemetry, and the
 *   time base of goodput and cost.
 * - Attempt counts, passing counts, goodput and cost use one accounting
 *   window. Its duration and the source of that duration are part of the
 *   result; one source is never swapped for another silently.
 * - When the population of dispatched attempts cannot be established, observed
 *   values are exploratory and the point cannot qualify.
 * - Measurements (`observed`) and the verdict (`qualification`) are separate,
 *   so a point below the sample policy keeps its valid observed values.
 */

/** Bump when target evaluation changes; part of every evaluation cache key. */
export const SLA_EVALUATOR_VERSION = 1;

const EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export interface SlaLatencyTargets {
  /** Maximum time to first token, ms. */
  maxTtftMs: number;
  /**
   * Maximum time per output token, ms: the average decode time per output
   * token within one request, not a bound on every gap between tokens.
   */
  maxTpotMs: number;
  /** Maximum end-to-end latency, s. `null` leaves the target off. */
  maxE2eS: number | null;
}

export interface SlaTargets extends SlaLatencyTargets {
  /** Required share of attempts that must pass, in (0, 1). */
  requiredAttainment: number;
}

/** The worked example of the feature brief. An example, not a recommendation. */
export const SLA_EXAMPLE_TARGETS: SlaTargets = {
  maxTtftMs: 1000,
  maxTpotMs: 50,
  maxE2eS: null,
  requiredAttainment: 0.99,
};

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidSlaLatencyTargets(targets: SlaLatencyTargets): boolean {
  return (
    isPositive(targets.maxTtftMs) &&
    isPositive(targets.maxTpotMs) &&
    (targets.maxE2eS === null || isPositive(targets.maxE2eS))
  );
}

/** Canonical text form of the latency targets, for cache keys. Values are not rounded. */
export function slaLatencyTargetsKey(targets: SlaLatencyTargets): string {
  return `ttft=${targets.maxTtftMs};tpot=${targets.maxTpotMs};e2e=${targets.maxE2eS ?? 'off'}`;
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export type SlaAttemptOutcome = 'completed' | 'failed' | 'cancelled' | 'incomplete' | 'unknown';
export type SlaOtherOutcome = Exclude<SlaAttemptOutcome, 'completed'>;

/** One attempt as a client export describes it. */
export interface SlaAttemptRecord {
  outcome: SlaAttemptOutcome;
  /** Error class the client recorded, for `failed` attempts. */
  failureClass?: string | null;
  ttftMs: number | null;
  tpotMs: number | null;
  e2eS: number | null;
  outputTokens: number | null;
}

/** Column value for a metric the client did not record. */
export const SLA_NOT_RECORDED = -1;
/**
 * `tpotUs` value of a completed attempt with fewer than two output tokens:
 * TPOT is undefined for it, so the TPOT target does not apply.
 */
export const SLA_TPOT_NOT_APPLICABLE = -2;

/**
 * Latencies of completed attempts, one entry per attempt, in whole
 * microseconds so that a comparison against a target is exact.
 */
export interface SlaCompletedColumns {
  ttftUs: number[];
  tpotUs: number[];
  e2eUs: number[];
}

export interface SlaOutcomeCount {
  outcome: SlaOtherOutcome;
  failureClass: string | null;
  count: number;
}

/** The attempts of one load point: completed ones with latencies, the rest by outcome. */
export interface SlaAttemptSet {
  completed: SlaCompletedColumns;
  /**
   * Attempts the client called completed whose stream showed no evidence at
   * all that the response finished: no finish reason, no end-of-stream marker,
   * no usage block. Whether they count as completions is
   * `policy.completionEvidence`. Absent when the client records no such evidence.
   */
  unconfirmed?: SlaCompletedColumns;
  other: SlaOutcomeCount[];
}

function toMicros(value: number | null, unitUs: number): number {
  return value === null || !Number.isFinite(value) || value < 0
    ? SLA_NOT_RECORDED
    : Math.round(value * unitUs);
}

function addOutcome(
  counts: SlaOutcomeCount[],
  outcome: SlaOtherOutcome,
  failureClass: string | null,
  count: number,
): void {
  if (count <= 0) return;
  const existing = counts.find(
    (entry) => entry.outcome === outcome && entry.failureClass === failureClass,
  );
  if (existing) existing.count += count;
  else counts.push({ outcome, failureClass, count });
}

/**
 * Build an attempt set from per-attempt records. A record that is not
 * `completed` keeps its outcome whatever latencies it carries: a stream that
 * produced a first token and then failed is a failed attempt.
 */
export function slaAttemptSet(records: readonly SlaAttemptRecord[]): SlaAttemptSet {
  const completed: SlaCompletedColumns = { ttftUs: [], tpotUs: [], e2eUs: [] };
  const other: SlaOutcomeCount[] = [];
  for (const record of records) {
    if (record.outcome === 'completed') {
      completed.ttftUs.push(toMicros(record.ttftMs, 1e3));
      completed.tpotUs.push(
        record.outputTokens !== null && record.outputTokens < 2
          ? SLA_TPOT_NOT_APPLICABLE
          : toMicros(record.tpotMs, 1e3),
      );
      completed.e2eUs.push(toMicros(record.e2eS, 1e6));
    } else {
      addOutcome(
        other,
        record.outcome,
        record.outcome === 'failed' ? (record.failureClass ?? null) : null,
        1,
      );
    }
  }
  return { completed, other };
}

// ---------------------------------------------------------------------------
// Accounting policy
// ---------------------------------------------------------------------------

/**
 * The judgment calls of attempt accounting. Each field is one decision with a
 * documented alternative; changing one changes `slaAccountingPolicyKey`, so
 * cached evaluations made under another policy are never reused.
 */
export interface SlaAccountingPolicy {
  /** Bump when a rule outside these fields changes. */
  version: number;
  /**
   * Attempts still in flight when the grace period ended, which the load
   * generator cancels without a record. Their TTFT and TPOT are unknown.
   * - `not_passing`: in the denominator and counted as not passing.
   * - `indeterminate`: in the denominator; a miss is declared only when it
   *   would hold even had all of them passed.
   */
  incompleteAtCutoff: 'not_passing' | 'indeterminate';
  /**
   * Requests the server rejected because the prompt exceeds the model context.
   * - `excluded`: reported, not eligible: the trace does not fit the model.
   * - `failed_attempt`: eligible, counted as failed with class `context_overflow`.
   */
  contextOverflow: 'excluded' | 'failed_attempt';
  /** Share of issued requests rejected for context overflow above which a point is flagged. */
  contextOverflowLimit: number;
  /**
   * Completed attempts that lack a value an enabled target needs.
   * - `not_passing`: eligible and counted as not passing.
   * - `indeterminate`: eligible with an unknown verdict.
   */
  missingTelemetry: 'not_passing' | 'indeterminate';
  /**
   * Time base of goodput and cost.
   * - `configured_window`: the configured dispatch window, the one duration
   *   that is equal across load points. Attempts dispatched in the window that
   *   finish during the grace period count; warmup and grace time are not billed.
   * - `phase_elapsed`: phase start to phase completion, grace and drain included.
   */
  timeBase: 'configured_window' | 'phase_elapsed';
  /**
   * Attempts the client called completed without evidence that the response
   * finished (`SlaAttemptSet.unconfirmed`). A first token is not that evidence.
   * - `required`: eligible and not passing, reported as their own count. They
   *   are missing completion evidence, not a recorded service failure.
   * - `not_required`: taken as completed, on the client's word.
   */
  completionEvidence: 'required' | 'not_required';
}

export const SLA_ACCOUNTING_POLICY: SlaAccountingPolicy = {
  version: 1,
  incompleteAtCutoff: 'not_passing',
  contextOverflow: 'excluded',
  contextOverflowLimit: 0.01,
  missingTelemetry: 'not_passing',
  timeBase: 'configured_window',
  completionEvidence: 'required',
};

/** Accounting policy version of the default policy; part of every cache key. */
export const SLA_ACCOUNTING_POLICY_VERSION = SLA_ACCOUNTING_POLICY.version;

/** Canonical text form of an accounting policy, for cache keys. */
export function slaAccountingPolicyKey(policy: SlaAccountingPolicy): string {
  return [
    `v${policy.version}`,
    `cutoff=${policy.incompleteAtCutoff}`,
    `overflow=${policy.contextOverflow}@${policy.contextOverflowLimit}`,
    `telemetry=${policy.missingTelemetry}`,
    `time=${policy.timeBase}`,
    `completion=${policy.completionEvidence}`,
  ].join(';');
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

/**
 * Where the accounting window duration comes from.
 * - `configured_window`: the dispatch window the load generator was given.
 * - `phase_elapsed`: phase start to phase completion as the load generator
 *   logged it, including the grace period and the cancellation drain.
 * - `client_reported`: a duration the benchmark client reported for the run.
 * - `attempt_span`: first attempt start to last attempt end. It shrinks when
 *   the last attempts never finish, so it is not comparable across load points.
 */
export type SlaDurationSource =
  | 'configured_window'
  | 'phase_elapsed'
  | 'client_reported'
  | 'attempt_span';

/** Every duration a client export offers. `null` means the export does not carry it. */
export interface SlaWindowTimings {
  /** Seconds during which new attempts were dispatched, as configured. */
  configuredWindowS: number | null;
  /** Grace given to in-flight attempts after dispatch stopped. */
  graceS: number | null;
  /** Phase start to phase completion, grace and drain included. */
  phaseElapsedS: number | null;
  /** The duration the client itself divides by for its throughput. */
  clientDurationS: number | null;
  /** First attempt start to last attempt end. */
  attemptSpanS: number | null;
  /** Whether attempts were still in flight when the grace period ended. */
  cutoffReached: boolean | null;
}

export interface SlaWindow extends SlaWindowTimings {
  /** Seconds that goodput and cost divide by. */
  durationS: number;
  durationSource: SlaDurationSource;
}

/**
 * Choose the accounting window duration. The policy time base is used when
 * the export carries it; otherwise the next source in a fixed order, and the
 * result always names the source that was used.
 */
export function slaWindow(timings: SlaWindowTimings, policy: SlaAccountingPolicy): SlaWindow {
  const sources: [SlaDurationSource, number | null][] = [
    ['configured_window', timings.configuredWindowS],
    ['phase_elapsed', timings.phaseElapsedS],
    ['client_reported', timings.clientDurationS],
    ['attempt_span', timings.attemptSpanS],
  ];
  const ordered = [
    ...sources.filter(([source]) => source === policy.timeBase),
    ...sources.filter(([source]) => source !== policy.timeBase),
  ];
  const [durationSource, durationS] = ordered.find(
    ([, value]) => value !== null && Number.isFinite(value) && value > 0,
  ) ?? ['attempt_span', 0];
  return { ...timings, durationS: durationS ?? 0, durationSource };
}

/**
 * - `no_client_retries`: the client never retries, one attempt per request.
 * - `each_attempt_counted`: the client retries and every try is an attempt.
 * - `unknown`: the export does not say, so retries may hide failed attempts.
 */
export type SlaRetryAccounting = 'no_client_retries' | 'each_attempt_counted' | 'unknown';

/** `explicit`: the client recorded each outcome. `inferred`: derived from which values exist. */
export type SlaOutcomeSource = 'explicit' | 'inferred';

/** What a client export says about the attempts of one load point, before any policy. */
export interface SlaAccountingInput {
  /** Requests the load generator issued in the measurement phase; `null` when not recorded. */
  issued: number | null;
  /** Smallest issued count the attempt records alone prove; `null` when they carry no sequence. */
  issuedLowerBound: number | null;
  /** Issued requests the client dropped before dispatch; `null` when not recorded. */
  skippedBeforeDispatch: number | null;
  /** Attempts in flight at the cutoff that have no record; `null` when not recorded. */
  incompleteAtCutoff: number | null;
  /** Requests rejected for context overflow that have no record; `null` when not recorded. */
  contextOverflowRejected: number | null;
  /** Warmup attempts left out; `null` when not recorded. */
  warmupExcluded: number | null;
  retryAccounting: SlaRetryAccounting;
  outcomeSource: SlaOutcomeSource;
  /**
   * The client says its records do not account for the whole measurement: the
   * run was cancelled, interrupted or aborted, or its own counts disagree. The
   * records it left may be exact, but they are not the full population. Absent
   * means the client reported a complete run.
   */
  measurementIncomplete?: boolean;
  timings: SlaWindowTimings;
}

export type SlaAccountingCompleteness = 'complete' | 'partial' | 'unknown';

export type SlaAccountingReason =
  /** Every dispatched attempt has an explicit outcome. */
  | 'reconciled'
  /** Issued count known; some attempts have no recorded outcome. */
  | 'outcomes_unknown'
  /** Attempt records with explicit outcomes, but no issued count: a lower bound. */
  | 'dispatch_count_unavailable'
  /** Outcomes were derived from which latency values exist, not recorded. */
  | 'outcomes_not_explicit'
  /** More attempt records than the client says it issued. */
  | 'records_exceed_dispatched'
  /** The client did not finish the measurement, or says its counts do not cover it. */
  | 'measurement_incomplete'
  /** Neither attempt records nor an issued count. */
  | 'no_attempt_records';

export interface SlaAccounting {
  policy: SlaAccountingPolicy;
  /** Requests the load generator issued, or `null`. */
  issued: number | null;
  issuedLowerBound: number | null;
  /** Eligible dispatched attempts as reconciled from `issued`, or `null`. */
  dispatched: number | null;
  /** The denominator: `dispatched` when established, else the attempts with a record. */
  attempted: number;
  completed: number;
  failed: number;
  cancelled: number;
  /** Still in flight at the cutoff. */
  incomplete: number;
  /** Dispatched without a recorded outcome, including attempts nothing accounts for. */
  unknown: number;
  /** Failed attempts by the error class the client recorded. */
  failureClasses: Record<string, number>;
  /**
   * Attempts the client called completed without any completion evidence,
   * however the policy counts them. Under `completionEvidence: required` they
   * are in `attempted`, in neither `completed` nor `failed`, and never pass.
   */
  unconfirmedCompletions: number;
  skippedBeforeDispatch: number | null;
  /** Requests rejected for context overflow, however the policy counts them. */
  contextOverflowRejected: number | null;
  /** The rejected share of issued requests is above the policy limit. */
  contextOverflowOverLimit: boolean;
  warmupExcluded: number | null;
  retryAccounting: SlaRetryAccounting;
  outcomeSource: SlaOutcomeSource;
  window: SlaWindow;
  completeness: SlaAccountingCompleteness;
  reason: SlaAccountingReason;
  /** True when `attempted` is the full population of eligible dispatched attempts. */
  populationEstablished: boolean;
}

/** Failure class for failed attempts whose export names no error class. */
export const SLA_UNCLASSIFIED_FAILURE = 'unclassified';
/** Failure class of context-overflow rejections when the policy counts them as attempts. */
export const SLA_CONTEXT_OVERFLOW_FAILURE = 'context_overflow';

/**
 * Reconcile the attempts of one load point against what the load generator
 * says it issued. Issued requests that no record, cutoff count, skip count or
 * rejection count accounts for become `unknown`; they are never dropped and
 * never assumed to have passed.
 */
export function reconcileSlaAccounting(
  set: SlaAttemptSet,
  input: SlaAccountingInput,
  policy: SlaAccountingPolicy = SLA_ACCOUNTING_POLICY,
): SlaAccounting {
  const totals = { failed: 0, cancelled: 0, incomplete: input.incompleteAtCutoff ?? 0, unknown: 0 };
  const failureClasses: Record<string, number> = {};
  const addFailures = (failureClass: string, count: number): void => {
    if (count <= 0) return;
    totals.failed += count;
    failureClasses[failureClass] = (failureClasses[failureClass] ?? 0) + count;
  };
  for (const entry of set.other) {
    if (entry.outcome === 'failed') {
      addFailures(entry.failureClass ?? SLA_UNCLASSIFIED_FAILURE, entry.count);
    } else {
      totals[entry.outcome] += entry.count;
    }
  }
  const overflow = input.contextOverflowRejected ?? 0;
  if (policy.contextOverflow === 'failed_attempt') {
    addFailures(SLA_CONTEXT_OVERFLOW_FAILURE, overflow);
  }
  const unconfirmed = set.unconfirmed?.ttftUs.length ?? 0;
  const evidenceRequired = policy.completionEvidence === 'required';
  const completed = set.completed.ttftUs.length + (evidenceRequired ? 0 : unconfirmed);
  const classified =
    (evidenceRequired ? unconfirmed : 0) +
    completed +
    totals.failed +
    totals.cancelled +
    totals.incomplete +
    totals.unknown;

  const { issued } = input;
  const dispatched =
    issued === null
      ? null
      : issued -
        (input.skippedBeforeDispatch ?? 0) -
        (policy.contextOverflow === 'excluded' ? overflow : 0);
  const exceeds = dispatched !== null && classified > dispatched;
  const established = dispatched !== null && !exceeds;
  const unknown = totals.unknown + (established ? dispatched - classified : 0);
  const attempted = established ? dispatched : classified;

  let completeness: SlaAccountingCompleteness = 'complete';
  let reason: SlaAccountingReason = 'reconciled';
  if (attempted === 0) {
    completeness = 'unknown';
    reason = 'no_attempt_records';
  } else if (exceeds) {
    completeness = 'unknown';
    reason = 'records_exceed_dispatched';
  } else if (input.measurementIncomplete === true) {
    // Stated first among the partial cases: counts that happen to add up do
    // not make an interrupted measurement a complete one.
    completeness = 'partial';
    reason = 'measurement_incomplete';
  } else if (input.outcomeSource !== 'explicit') {
    completeness = 'unknown';
    reason = 'outcomes_not_explicit';
  } else if (dispatched === null) {
    completeness = 'partial';
    reason = 'dispatch_count_unavailable';
  } else if (unknown > 0) {
    completeness = 'partial';
    reason = 'outcomes_unknown';
  }

  return {
    policy,
    issued,
    issuedLowerBound: input.issuedLowerBound,
    dispatched: exceeds ? null : dispatched,
    attempted,
    completed,
    failed: totals.failed,
    cancelled: totals.cancelled,
    incomplete: totals.incomplete,
    unknown,
    failureClasses,
    unconfirmedCompletions: unconfirmed,
    skippedBeforeDispatch: input.skippedBeforeDispatch,
    contextOverflowRejected: input.contextOverflowRejected,
    contextOverflowOverLimit:
      issued !== null && issued > 0 && overflow / issued > policy.contextOverflowLimit,
    warmupExcluded: input.warmupExcluded,
    retryAccounting: input.retryAccounting,
    outcomeSource: input.outcomeSource,
    window: slaWindow(input.timings, policy),
    completeness,
    reason,
    populationEstablished: reason === 'reconciled' || reason === 'outcomes_unknown',
  };
}

// ---------------------------------------------------------------------------
// Exact target evaluation
// ---------------------------------------------------------------------------

/** Attempt counts of one load point against one set of latency targets. */
export interface SlaPointCounts {
  /** Completed attempts with every enabled target met. */
  passing: number;
  /** Attempts that do not pass: a target exceeded, failed, cancelled, or not passing by policy. */
  notPassing: number;
  /** Attempts whose verdict cannot be known: `attempted - passing - notPassing`. */
  indeterminate: number;
  /** Completed attempts within the TTFT target alone. */
  withinTtft: number;
  /** Completed attempts within the TPOT target alone. */
  withinTpot: number;
  /** Completed attempts within the end-to-end target alone; `null` when the target is off. */
  withinE2e: number | null;
  /** Completed attempts that lack a value an enabled target needs. */
  missingTelemetry: number;
  /** Of `notPassing`, the attempts that were in flight at the cutoff. */
  incompleteNotPassing: number;
}

/**
 * A target in microseconds, the unit attempts are stored in. Converting a
 * decimal number of milliseconds or seconds in binary can land a hair under
 * the value meant (1.001 ms becomes 1000.9999999999999 us), which would
 * exclude an attempt exactly on the threshold. Taking the product at
 * nanosecond resolution removes that noise and changes no value a person can
 * enter.
 */
function targetLimitUs(value: number, usPerUnit: number): number {
  return Math.round(value * usPerUnit * 1e3) / 1e3;
}

/** -1 exceeded, 0 not recorded, 1 within. The limit is compared as entered, inclusive. */
function compare(valueUs: number, limitUs: number): -1 | 0 | 1 {
  if (valueUs === SLA_NOT_RECORDED) return 0;
  return valueUs <= limitUs ? 1 : -1;
}

/**
 * Evaluate the attempts of one load point against latency targets, exactly:
 * no binning, no rounding of the targets, and the joint verdict is taken per
 * attempt, never derived from separate percentiles.
 *
 * TPOT is undefined for a completed attempt with fewer than two output
 * tokens, so the TPOT target does not apply to it. How attempts in flight at
 * the cutoff and completed attempts with missing telemetry count is set by
 * the accounting policy the point was reconciled under.
 */
export function evaluateSlaAttempts(
  set: SlaAttemptSet,
  accounting: SlaAccounting,
  targets: SlaLatencyTargets,
): SlaPointCounts {
  const ttftLimit = targetLimitUs(targets.maxTtftMs, 1e3);
  const tpotLimit = targetLimitUs(targets.maxTpotMs, 1e3);
  const e2eLimit = targets.maxE2eS === null ? null : targetLimitUs(targets.maxE2eS, 1e6);
  let passing = 0;
  let exceeded = 0;
  let withinTtft = 0;
  let withinTpot = 0;
  let withinE2e = 0;
  let missingTelemetry = 0;
  let missingOnly = 0;
  const { policy } = accounting;
  // Completions without completion evidence are evaluated only when the policy
  // takes them as completed; otherwise they are counted below as not passing.
  const evaluated =
    policy.completionEvidence === 'required' || set.unconfirmed === undefined
      ? [set.completed]
      : [set.completed, set.unconfirmed];
  for (const { ttftUs, tpotUs, e2eUs } of evaluated) {
    for (let index = 0; index < ttftUs.length; index += 1) {
      const ttft = compare(ttftUs[index], ttftLimit);
      const tpot =
        tpotUs[index] === SLA_TPOT_NOT_APPLICABLE ? 1 : compare(tpotUs[index], tpotLimit);
      const e2e = e2eLimit === null ? 1 : compare(e2eUs[index], e2eLimit);
      if (ttft === 1) withinTtft += 1;
      if (tpot === 1) withinTpot += 1;
      if (e2e === 1) withinE2e += 1;
      const missing = ttft === 0 || tpot === 0 || e2e === 0;
      if (missing) missingTelemetry += 1;
      if (ttft === -1 || tpot === -1 || e2e === -1) exceeded += 1;
      else if (missing) missingOnly += 1;
      else passing += 1;
    }
  }
  const incompleteNotPassing =
    policy.incompleteAtCutoff === 'not_passing' ? accounting.incomplete : 0;
  const notPassing =
    exceeded +
    accounting.failed +
    accounting.cancelled +
    incompleteNotPassing +
    (policy.completionEvidence === 'required' ? accounting.unconfirmedCompletions : 0) +
    (policy.missingTelemetry === 'not_passing' ? missingOnly : 0);
  return {
    passing,
    notPassing,
    indeterminate: Math.max(0, accounting.attempted - passing - notPassing),
    withinTtft,
    withinTpot,
    withinE2e: e2eLimit === null ? null : withinE2e,
    missingTelemetry,
    incompleteNotPassing,
  };
}

// ---------------------------------------------------------------------------
// Observed values and qualification
// ---------------------------------------------------------------------------

/** What was measured at one load point. Independent of the required attainment. */
export interface SlaObserved {
  attempted: number;
  passing: number;
  notPassing: number;
  indeterminate: number;
  /** `passing / attempted`: indeterminate attempts count against it. */
  attainment: number | null;
  /** Attainment had every indeterminate attempt passed. */
  attainmentUpper: number | null;
  /**
   * Attainment with the attempts in flight at the cutoff removed from the
   * population. Those attempts are unknown against TTFT and TPOT, so this is
   * the upper bound of what they could change.
   */
  attainmentExcludingIncomplete: number | null;
  /** Share of attempts within each target alone. Their product is not the joint attainment. */
  ttftAttainment: number | null;
  tpotAttainment: number | null;
  e2eAttainment: number | null;
  /** Passing attempts per second of the accounting window. */
  goodputRps: number | null;
  /** Completed attempts per second of the accounting window: the achieved request rate. */
  completedRps: number | null;
  durationS: number;
  durationSource: SlaDurationSource;
}

function ratio(numerator: number | null, denominator: number): number | null {
  return numerator === null || denominator <= 0 ? null : numerator / denominator;
}

export function observeSlaPoint(accounting: SlaAccounting, counts: SlaPointCounts): SlaObserved {
  const { attempted, window } = accounting;
  return {
    attempted,
    passing: counts.passing,
    notPassing: counts.notPassing,
    indeterminate: counts.indeterminate,
    attainment: ratio(counts.passing, attempted),
    attainmentUpper: ratio(counts.passing + counts.indeterminate, attempted),
    attainmentExcludingIncomplete: ratio(counts.passing, attempted - counts.incompleteNotPassing),
    ttftAttainment: ratio(counts.withinTtft, attempted),
    tpotAttainment: ratio(counts.withinTpot, attempted),
    e2eAttainment: ratio(counts.withinE2e, attempted),
    goodputRps: ratio(counts.passing, window.durationS),
    completedRps: ratio(accounting.completed, window.durationS),
    durationS: window.durationS,
    durationSource: window.durationSource,
  };
}

/**
 * How many attempts a point needs before it can qualify. A heuristic that
 * keeps a verdict from resting on a handful of requests; it is not a
 * confidence interval and gives no statistical guarantee.
 */
export interface SlaSamplePolicy {
  /** Fewest attempts for any required attainment. */
  absoluteMinimum: number;
  /** A point needs enough attempts that this many misses still meet the required attainment. */
  minimumAllowedMisses: number;
  /** Below the attempts that allow this many misses, a verdict is flagged as a small sample. */
  smallSampleAllowedMisses: number;
}

export const SLA_SAMPLE_POLICY: SlaSamplePolicy = {
  absoluteMinimum: 100,
  minimumAllowedMisses: 1,
  smallSampleAllowedMisses: 10,
};

function attemptsForAllowedMisses(requiredAttainment: number, misses: number): number {
  if (!(requiredAttainment > 0) || !(requiredAttainment < 1)) return Number.POSITIVE_INFINITY;
  return Math.ceil((misses / (1 - requiredAttainment)) * (1 - EPSILON));
}

/** Fewest attempts for a verdict at this required attainment. */
export function minimumSampleSize(
  requiredAttainment: number,
  policy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): number {
  return Math.max(
    policy.absoluteMinimum,
    attemptsForAllowedMisses(requiredAttainment, policy.minimumAllowedMisses),
  );
}

/** Below this many attempts a verdict is flagged as resting on a small sample. */
export function smallSampleSize(
  requiredAttainment: number,
  policy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): number {
  return Math.max(
    minimumSampleSize(requiredAttainment, policy),
    attemptsForAllowedMisses(requiredAttainment, policy.smallSampleAllowedMisses),
  );
}

export type SlaStatus = 'meets' | 'misses' | 'insufficient_data';

/**
 * Why a measured load point has nothing to evaluate. None of these is a
 * failure of the service, and none may be shown as zero or approximated from
 * aggregate percentiles.
 * - `no_request_level_data`: the run kept aggregates only.
 * - `request_columns_omitted`: the run recorded each attempt, but the stored
 *   result left the per-attempt columns out for size.
 * - `request_records_unreadable`: per-attempt data exists in a form this
 *   evaluator does not read, or that contradicts its own counts.
 */
export type SlaUnavailableReason =
  | 'no_request_level_data'
  | 'request_columns_omitted'
  | 'request_records_unreadable';

export type SlaQualificationReason =
  | 'attainment_met'
  | 'attainment_below_required'
  /** The service failed at this load, so no measurement exists. */
  | 'service_failure'
  /** The benchmark measurement itself was invalid; says nothing about the service. */
  | 'invalid_measurement'
  /** The load point failed and its records do not say whether the service or the benchmark did. */
  | 'failure_undetermined'
  /** The dispatched attempts cannot be established; observed values are exploratory. */
  | 'attempt_population_not_established'
  /** The measurement was cancelled, interrupted or left incomplete; observed values are exploratory. */
  | 'measurement_incomplete'
  /** Fewer attempts than the sample policy asks for. */
  | 'below_minimum_sample'
  /** Passing or missing depends on attempts whose verdict cannot be known. */
  | 'outcomes_unresolved'
  | SlaUnavailableReason
  | 'no_eligible_attempts';

export interface SlaQualification {
  status: SlaStatus;
  reason: SlaQualificationReason;
  /** Observed values exist but cannot support a verdict or a ranking. */
  exploratory: boolean;
  /** A verdict was reached on fewer attempts than `smallSampleSize`. */
  smallSample: boolean;
  /** Attempts the sample policy asks for at this required attainment. */
  minimumSample: number;
}

function meetsAttainment(passing: number, attempted: number, requiredAttainment: number): boolean {
  return passing >= requiredAttainment * attempted - EPSILON * attempted;
}

export function qualifySlaPoint(
  observed: SlaObserved,
  accounting: SlaAccounting,
  requiredAttainment: number,
  policy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): SlaQualification {
  const minimumSample = minimumSampleSize(requiredAttainment, policy);
  const insufficient = (
    reason: SlaQualificationReason,
    exploratory: boolean,
  ): SlaQualification => ({
    status: 'insufficient_data',
    reason,
    exploratory,
    smallSample: false,
    minimumSample,
  });
  if (observed.attempted === 0) return insufficient('no_eligible_attempts', false);
  if (accounting.reason === 'measurement_incomplete') {
    return insufficient('measurement_incomplete', true);
  }
  if (!accounting.populationEstablished) {
    return insufficient('attempt_population_not_established', true);
  }
  if (observed.attempted < minimumSample) return insufficient('below_minimum_sample', false);

  const smallSample = observed.attempted < smallSampleSize(requiredAttainment, policy);
  if (meetsAttainment(observed.passing, observed.attempted, requiredAttainment)) {
    return {
      status: 'meets',
      reason: 'attainment_met',
      exploratory: false,
      smallSample,
      minimumSample,
    };
  }
  const best = observed.passing + observed.indeterminate;
  if (meetsAttainment(best, observed.attempted, requiredAttainment)) {
    return insufficient('outcomes_unresolved', false);
  }
  return {
    status: 'misses',
    reason: 'attainment_below_required',
    exploratory: false,
    smallSample,
    minimumSample,
  };
}

// ---------------------------------------------------------------------------
// Load points
// ---------------------------------------------------------------------------

/**
 * What the load value of a point means. Both families are closed-loop: the
 * client holds a fixed number of lanes busy, so neither is an offered request
 * rate, and a result says nothing about open-loop request-rate capacity.
 * - `agentx_users`: replay lanes, each one simulated user replaying a session.
 * - `request_concurrency`: the limit on requests in flight at once.
 */
export type SlaLoadKind = 'agentx_users' | 'request_concurrency';

export interface SlaLoad {
  kind: SlaLoadKind;
  value: number;
}

export interface SlaCostBasis {
  /** $ per GPU-hour. */
  gpuHourUsd: number;
  gpuCount: number;
}

/**
 * Why a tested load point has no measurement.
 * - `service_failure`: the system under test failed at this load.
 * - `invalid_measurement`: the benchmark run itself was invalid.
 * - `undetermined`: the job failed and its records do not say which of the two it was.
 */
export type SlaExclusionCategory = 'service_failure' | 'invalid_measurement' | 'undetermined';

export type SlaPointData =
  | { kind: 'measured'; accounting: SlaAccounting; counts: SlaPointCounts }
  | { kind: 'excluded'; category: SlaExclusionCategory; reason: string }
  | {
      kind: 'unavailable';
      reason: SlaUnavailableReason;
      /** What the producer or the ingest recorded about it, in its own words. */
      detail?: string | null;
    };

export interface SlaPointInput {
  load: SlaLoad;
  data: SlaPointData;
  /** `null` when the hardware has no cost on file. */
  cost: SlaCostBasis | null;
}

export interface SlaPointResult {
  load: SlaLoad;
  /** `null` when the point has no request-level measurement. */
  observed: SlaObserved | null;
  accounting: SlaAccounting | null;
  qualification: SlaQualification;
  /** GPU cost of the whole accounting window, $. */
  windowCostUsd: number | null;
  /** `windowCostUsd` per 1,000 passing attempts, $. */
  costPer1kCompliantUsd: number | null;
  /** Set when the point was excluded from measurement. */
  exclusion: { category: SlaExclusionCategory; reason: string } | null;
  /** Set when the point was measured but has nothing to evaluate. */
  unavailable: { reason: SlaUnavailableReason; detail: string | null } | null;
}

/** GPU cost of an accounting window: every GPU for the whole window, idle time included. */
export function windowCostUsd(cost: SlaCostBasis | null, durationS: number): number | null {
  if (cost === null || !isPositive(cost.gpuHourUsd) || !isPositive(cost.gpuCount)) return null;
  if (!isPositive(durationS)) return null;
  return cost.gpuHourUsd * cost.gpuCount * (durationS / 3600);
}

/** $ per 1,000 passing attempts: the cost of the whole accounting window over what passed. */
export function costPer1kCompliantUsd(
  cost: SlaCostBasis | null,
  durationS: number,
  passing: number,
): number | null {
  const total = windowCostUsd(cost, durationS);
  return total === null || passing <= 0 ? null : (total / passing) * 1000;
}

export function evaluateSlaPoint(
  input: SlaPointInput,
  requiredAttainment: number,
  policy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): SlaPointResult {
  const { load, data } = input;
  if (data.kind !== 'measured') {
    const excluded = data.kind === 'excluded';
    return {
      load,
      observed: null,
      accounting: null,
      qualification: {
        status: excluded && data.category === 'service_failure' ? 'misses' : 'insufficient_data',
        reason: excluded
          ? data.category === 'undetermined'
            ? 'failure_undetermined'
            : data.category
          : data.reason,
        exploratory: false,
        smallSample: false,
        minimumSample: minimumSampleSize(requiredAttainment, policy),
      },
      windowCostUsd: null,
      costPer1kCompliantUsd: null,
      exclusion: excluded ? { category: data.category, reason: data.reason } : null,
      unavailable: excluded ? null : { reason: data.reason, detail: data.detail ?? null },
    };
  }
  const observed = observeSlaPoint(data.accounting, data.counts);
  return {
    load,
    observed,
    accounting: data.accounting,
    qualification: qualifySlaPoint(observed, data.accounting, requiredAttainment, policy),
    windowCostUsd: windowCostUsd(input.cost, observed.durationS),
    costPer1kCompliantUsd: costPer1kCompliantUsd(input.cost, observed.durationS, observed.passing),
    exclusion: null,
    unavailable: null,
  };
}

// ---------------------------------------------------------------------------
// Configurations
// ---------------------------------------------------------------------------

/** Indexes into `points` of the measured point that supports each headline value. */
export interface SlaSelections {
  /** The highest tested load that meets the targets. */
  highestPassingLoad: number | null;
  /** The qualifying point with the highest goodput. */
  highestGoodput: number | null;
  /** The qualifying point with the lowest cost per 1,000 passing attempts. */
  lowestCost: number | null;
}

export interface SlaConfigResult {
  /**
   * `meets` when any tested load meets the targets; `misses` when none does
   * and at least one misses; otherwise `insufficient_data`.
   */
  status: SlaStatus;
  /** No verdict, and the only observed values come from points that cannot support one. */
  exploratory: boolean;
  /** One result per input point, in input order. */
  points: SlaPointResult[];
  selections: SlaSelections;
  /**
   * A tested load below the highest passing one did not meet the targets.
   * The highest passing load is literal, not the edge of a monotonic range.
   */
  lowerLoadMissed: boolean;
}

function pickIndex(
  points: readonly SlaPointResult[],
  value: (point: SlaPointResult) => number | null,
  better: (candidate: number, current: number) => boolean,
): number | null {
  let best: number | null = null;
  let bestValue = 0;
  points.forEach((point, index) => {
    if (point.qualification.status !== 'meets') return;
    const candidate = value(point);
    if (candidate === null) return;
    if (best === null || better(candidate, bestValue)) {
      best = index;
      bestValue = candidate;
    }
  });
  return best;
}

export function evaluateSlaConfig(
  inputs: readonly SlaPointInput[],
  requiredAttainment: number,
  policy: SlaSamplePolicy = SLA_SAMPLE_POLICY,
): SlaConfigResult {
  const points = inputs.map((input) => evaluateSlaPoint(input, requiredAttainment, policy));
  const selections: SlaSelections = {
    highestPassingLoad: pickIndex(
      points,
      (point) => point.load.value,
      (a, b) => a > b,
    ),
    highestGoodput: pickIndex(
      points,
      (point) => point.observed?.goodputRps ?? null,
      (a, b) => a > b,
    ),
    lowestCost: pickIndex(
      points,
      (point) => point.costPer1kCompliantUsd,
      (a, b) => a < b,
    ),
  };
  const statuses = points.map((point) => point.qualification.status);
  const status: SlaStatus = statuses.includes('meets')
    ? 'meets'
    : statuses.includes('misses')
      ? 'misses'
      : 'insufficient_data';
  const highestLoad =
    selections.highestPassingLoad === null
      ? null
      : points[selections.highestPassingLoad].load.value;
  return {
    status,
    exploratory:
      status === 'insufficient_data' && points.some((point) => point.qualification.exploratory),
    points,
    selections,
    lowerLoadMissed:
      highestLoad !== null &&
      points.some(
        (point) => point.load.value < highestLoad && point.qualification.status !== 'meets',
      ),
  };
}

export type SlaRankBasis = 'cost' | 'goodput' | 'load';

/**
 * Order the qualifying configurations: lowest cost per 1,000 passing
 * attempts, highest goodput, or highest passing load. Configurations without
 * a qualifying point, including exploratory ones, are left out. Rows without a
 * value for the basis come last.
 */
export function rankQualifying<T extends { result: SlaConfigResult }>(
  rows: readonly T[],
  basis: SlaRankBasis,
): T[] {
  const value = ({ result }: T): number | null => {
    const { selections, points } = result;
    if (basis === 'cost') {
      return selections.lowestCost === null
        ? null
        : points[selections.lowestCost].costPer1kCompliantUsd;
    }
    if (basis === 'goodput') {
      const goodput =
        selections.highestGoodput === null
          ? null
          : (points[selections.highestGoodput].observed?.goodputRps ?? null);
      return goodput === null ? null : -goodput;
    }
    return selections.highestPassingLoad === null
      ? null
      : -points[selections.highestPassingLoad].load.value;
  };
  return rows
    .filter((row) => row.result.status === 'meets')
    .map((row, index) => ({ row, index, value: value(row) }))
    .toSorted(
      (a, b) =>
        (a.value ?? Number.POSITIVE_INFINITY) - (b.value ?? Number.POSITIVE_INFINITY) ||
        a.index - b.index,
    )
    .map(({ row }) => row);
}
