import type { PowerAudit } from './benchmark-mapper.js';
import type { Sql } from './db-utils.js';
import { recoveredPowerAudit, type RecoveredPowerAudit } from './power-audit-validations.js';

export type AgentxWindowPlan = ReadonlyMap<number, RecoveredPowerAudit>;

export function agentxWindowPlan(
  validations: Readonly<Record<string, Record<string, unknown>>>,
): AgentxWindowPlan {
  const plan = new Map<number, RecoveredPowerAudit>();
  for (const [source, validation] of Object.entries(validations)) {
    const audit = recoveredPowerAudit(source, validation);
    if (!audit) continue;
    const { concurrency } = validation.selected_window as { concurrency: number };
    plan.set(concurrency, audit);
  }
  return plan;
}

export interface AgentxAuditCandidate {
  benchmarkType: string;
  conc: number;
  powerAudit?: PowerAudit | null;
}

export interface AgentxAuditRefusal {
  concurrency: number;
  points: string[];
}

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
    if (group.every((point) => point.powerAudit)) continue;
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
