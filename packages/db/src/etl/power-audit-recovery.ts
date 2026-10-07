import type { PowerAudit } from './benchmark-mapper.js';
import type { Sql } from './db-utils.js';
import { recoveredPowerAudit, type RecoveredPowerAudit } from './power-audit-validations.js';

/** Retained AgentX windows of one telemetry artifact, keyed by concurrency. */
export type AgentxWindowPlan = ReadonlyMap<number, RecoveredPowerAudit>;

/**
 * One telemetry artifact owns its retained windows, keyed by concurrency.
 * Normalization aliases at most one nested validation per concurrency, and legacy
 * top-level documents never recover (`recoveredPowerAudit`), so each
 * concurrency maps to one window.
 */
export function agentxWindowPlan(
  validations: Readonly<Record<string, Record<string, unknown>>>,
): AgentxWindowPlan {
  const plan = new Map<number, RecoveredPowerAudit>();
  for (const [source, validation] of Object.entries(validations)) {
    const audit = recoveredPowerAudit(source, validation);
    if (!audit) continue;
    // recoveredPowerAudit accepted the window, so its concurrency is the nested one.
    const { concurrency } = validation.selected_window as { concurrency: number };
    plan.set(concurrency, audit);
  }
  return plan;
}

/** A benchmark point the caller may attach provenance to. */
export interface AgentxAuditCandidate {
  benchmarkType: string;
  conc: number;
  powerAudit?: PowerAudit | null;
}

export interface AgentxAuditRefusal {
  concurrency: number;
  /** Caller-chosen names of the points sharing the concurrency. */
  points: string[];
}

/**
 * Attach each retained window to the single agentic point at its concurrency
 * within the covered set (CI: one result file; backfill: one artifact pair).
 * A concurrency shared by two points is refused by name so the caller reports
 * it instead of guessing which measurement the window belongs to. Points come
 * back in input order.
 */
export function attachAgentxAudits<P extends AgentxAuditCandidate>(
  plan: AgentxWindowPlan,
  points: readonly P[],
  describe: (point: P) => string,
): { points: P[]; attached: number; refused: AgentxAuditRefusal[] } {
  const byConcurrency = new Map<number, P[]>();
  for (const point of points) {
    if (point.benchmarkType !== 'agentic_traces' || !plan.has(point.conc)) continue;
    byConcurrency.set(point.conc, [...(byConcurrency.get(point.conc) ?? []), point]);
  }
  const refused: AgentxAuditRefusal[] = [];
  const attach = new Set<P>();
  for (const [concurrency, group] of byConcurrency) {
    if (group.length === 1) attach.add(group[0]!);
    else refused.push({ concurrency, points: group.map(describe) });
  }
  return {
    points: points.map((point) =>
      attach.has(point) ? { ...point, powerAudit: plan.get(point.conc)! } : point,
    ),
    attached: attach.size,
    refused,
  };
}

export interface AgentxAuditWrite {
  benchmarkResultId: number;
  powerAudit: PowerAudit;
}

/**
 * Write planned provenance into stored AgentX rows that still lack it, in one
 * statement. The plan already decided which row a window belongs to; the
 * statement only guards the row's run, type and NULL audit, and returns the ids
 * it wrote.
 */
export async function applyAgentxAudits(
  sql: Sql,
  input: { workflowRunId: number; writes: readonly AgentxAuditWrite[] },
): Promise<number[]> {
  if (input.writes.length === 0) return [];
  const rows = await sql<{ id: number }[]>`
    update benchmark_results br set power_audit = planned.audit
    from unnest(
      ${sql.array(input.writes.map((write) => write.benchmarkResultId))}::bigint[],
      ${sql.array(input.writes.map((write) => JSON.stringify(write.powerAudit)))}::jsonb[]
    ) as planned(id, audit)
    where br.id = planned.id
      and br.workflow_run_id = ${input.workflowRunId}
      and br.benchmark_type = 'agentic_traces'
      and br.power_audit is null
    returning br.id
  `;
  return rows.map((row) => Number(row.id));
}
