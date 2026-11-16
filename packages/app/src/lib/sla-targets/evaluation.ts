import {
  evaluateSlaAttempts,
  isValidSlaLatencyTargets,
  reconcileSlaAccounting,
  SLA_ACCOUNTING_POLICY,
  type SlaAccounting,
  type SlaAccountingPolicy,
  type SlaLatencyTargets,
  type SlaPointCounts,
  type SlaUnavailableReason,
} from '@semianalysisai/inferencex-constants';
import type { SlaAttemptsBlob } from '@semianalysisai/inferencex-db/etl/sla-attempts';

/**
 * One load point evaluated against latency targets: counts and accounting,
 * never the attempt records. Everything that depends on the required
 * attainment or on prices is derived from this by `evaluateSlaTargetsView`.
 */
export interface SlaPointEvaluation {
  /** Where the attempt data came from and what the harness log said about the run. */
  source: SlaAttemptsBlob['source'];
  accounting: SlaAccounting;
  counts: SlaPointCounts;
}

/**
 * A point with nothing to evaluate: why, and what was recorded about it. It
 * carries no counts and no attainment, so nothing downstream can show it as
 * zero or as a pass.
 */
export interface SlaPointUnavailable {
  unavailable: SlaUnavailableReason;
  detail?: string | null;
}

export type SlaPointEvaluationResult = SlaPointEvaluation | SlaPointUnavailable;

export type SlaPointEvaluations = Record<number, SlaPointEvaluationResult>;

export function isSlaPointEvaluation(
  value: SlaPointEvaluationResult | undefined,
): value is SlaPointEvaluation {
  return value !== undefined && !('unavailable' in value);
}

/** Reconcile and evaluate the attempt data of one load point, exactly. */
export function evaluateSlaAttemptsBlob(
  blob: SlaAttemptsBlob,
  targets: SlaLatencyTargets,
  policy: SlaAccountingPolicy = SLA_ACCOUNTING_POLICY,
): SlaPointEvaluation {
  const accounting = reconcileSlaAccounting(blob.set, blob.accounting, policy);
  return {
    source: blob.source,
    accounting,
    counts: evaluateSlaAttempts(blob.set, accounting, targets),
  };
}

/** Largest latency target the evaluation routes accept, ms: one hour. */
export const SLA_MAX_TARGET_MS = 3_600_000;

export const SLA_TARGET_ERRORS = {
  ttft: 'ttft is required: a positive number of milliseconds, at most 3600000',
  tpot: 'tpot is required: a positive number of milliseconds, at most 3600000',
  e2e: 'e2e must be a positive number of seconds, at most 3600, or be left out',
} as const;

function positiveNumber(raw: string | null, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

/**
 * Read latency targets from query parameters. A value is used exactly as
 * written; one that cannot be evaluated is rejected with a message, never
 * rounded or replaced.
 */
export function parseSlaLatencyTargets(
  params: URLSearchParams,
): { targets: SlaLatencyTargets } | { error: string } {
  const maxTtftMs = positiveNumber(params.get('ttft'), SLA_MAX_TARGET_MS);
  if (maxTtftMs === null) return { error: SLA_TARGET_ERRORS.ttft };
  const maxTpotMs = positiveNumber(params.get('tpot'), SLA_MAX_TARGET_MS);
  if (maxTpotMs === null) return { error: SLA_TARGET_ERRORS.tpot };
  const rawE2e = params.get('e2e');
  const e2eOff = rawE2e === null || rawE2e === '' || rawE2e === 'off';
  const maxE2eS = e2eOff ? null : positiveNumber(rawE2e, SLA_MAX_TARGET_MS / 1000);
  if (!e2eOff && maxE2eS === null) return { error: SLA_TARGET_ERRORS.e2e };
  const targets = { maxTtftMs, maxTpotMs, maxE2eS };
  return isValidSlaLatencyTargets(targets) ? { targets } : { error: SLA_TARGET_ERRORS.ttft };
}

/** Query string for the evaluation routes. Values are written as entered. */
export function slaLatencyTargetsQuery(targets: SlaLatencyTargets): string {
  const params = new URLSearchParams({
    ttft: String(targets.maxTtftMs),
    tpot: String(targets.maxTpotMs),
  });
  if (targets.maxE2eS !== null) params.set('e2e', String(targets.maxE2eS));
  return params.toString();
}
