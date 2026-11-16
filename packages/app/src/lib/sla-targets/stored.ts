import type { SlaLatencyTargets } from '@semianalysisai/inferencex-constants';
import type { DbClient } from '@semianalysisai/inferencex-db/connection';
import {
  getSlaAttempts,
  getSlaAttemptsSources,
  type SlaAttemptsSource,
} from '@semianalysisai/inferencex-db/queries/sla-targets';

import {
  evaluateSlaAttemptsBlob,
  type SlaPointEvaluationResult,
  type SlaPointEvaluations,
} from './evaluation';

export const SLA_NO_REQUEST_DATA: SlaPointEvaluationResult = {
  unavailable: 'no_request_level_data',
};

/**
 * Read the stored attempt data of one benchmark point and evaluate it against
 * latency targets. This is the one place stored data becomes an evaluation:
 * the routes call it behind their cache, and the round-trip test calls it on
 * a local database.
 *
 * A point with nothing to evaluate comes back as `{ unavailable }` with the
 * recorded reason, never as counts of zero.
 */
export async function evaluateStoredSlaPoint(
  sql: DbClient,
  id: number,
  source: SlaAttemptsSource | undefined,
  targets: SlaLatencyTargets,
): Promise<SlaPointEvaluationResult> {
  if (source === undefined || source.kind === 'none') return SLA_NO_REQUEST_DATA;
  if (source.kind === 'unavailable') {
    return { unavailable: source.reason, detail: source.detail };
  }
  const blob = await getSlaAttempts(sql, id, source.kind);
  return blob ? evaluateSlaAttemptsBlob(blob, targets) : SLA_NO_REQUEST_DATA;
}

/** `evaluateStoredSlaPoint` for several points of one database. */
export async function evaluateStoredSlaPoints(
  sql: DbClient,
  ids: readonly number[],
  targets: SlaLatencyTargets,
): Promise<SlaPointEvaluations> {
  const sources = await getSlaAttemptsSources(sql, ids);
  const evaluations: SlaPointEvaluations = {};
  for (const id of ids) {
    evaluations[id] = await evaluateStoredSlaPoint(sql, id, sources[id], targets);
  }
  return evaluations;
}
