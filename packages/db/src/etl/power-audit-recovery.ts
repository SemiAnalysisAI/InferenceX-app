import { benchmarkPointIngestKey, type BenchmarkPersistenceInput } from './benchmark-ingest.js';
import type { PowerAudit } from './benchmark-mapper.js';
import type { Sql } from './db-utils.js';
import { recoveredPowerAuditForPoint } from './power-audit-validations.js';

export interface BenchmarkPowerAuditEvidence {
  resultFile: string;
  validations: Record<string, Record<string, unknown>>;
}

/** One run's exact sibling evidence also applies to its later aggregate copies. */
export function createBenchmarkPowerAuditRecovery() {
  const recovered = new Map<string, PowerAudit>();
  return <T extends BenchmarkPersistenceInput>(
    row: T,
    evidence?: BenchmarkPowerAuditEvidence,
  ): T => {
    if (row.benchmarkType !== 'agentic_traces' || row.powerAudit !== undefined) return row;
    const key = benchmarkPointIngestKey(row);
    if (evidence) {
      const audit = recoveredPowerAuditForPoint(evidence.validations, {
        conc: row.conc,
        resultFile: evidence.resultFile,
      });
      // Ambiguous/missing evidence must not establish new provenance.
      if (!audit) return row;
      recovered.set(key, audit);
    }
    const audit = recovered.get(key);
    return audit ? { ...row, powerAudit: audit } : row;
  };
}

/**
 * Fill `power_audit` on already stored AgentX rows that lack one, from the
 * retained windows of the telemetry bundle covering them. The caller has
 * resolved the bundle's exact benchmark identities; within that set a window
 * applies only when its concurrency names exactly one row. Returns the ids
 * written, so a backfill receipt can refresh their published metadata.
 */
export async function recoverStoredPowerAudits(
  sql: Sql,
  input: {
    workflowRunId: number;
    benchmarkResultIds: readonly number[];
    validations: Readonly<Record<string, Record<string, unknown>>>;
  },
): Promise<number[]> {
  // Every concurrency a retained window names; the selector decides which ones
  // are recoverable and unambiguous.
  const concurrencies = new Set<number>();
  for (const validation of Object.values(input.validations)) {
    const conc = (validation.selected_window as Record<string, unknown> | undefined)?.concurrency;
    if (typeof conc === 'number' && Number.isSafeInteger(conc) && conc > 0) concurrencies.add(conc);
  }
  const updated: number[] = [];
  for (const conc of concurrencies) {
    const audit = recoveredPowerAuditForPoint(input.validations, { conc });
    if (!audit) continue;
    const rows = await sql<{ id: number }[]>`
      with candidates as (
        select id from benchmark_results
        where workflow_run_id = ${input.workflowRunId}
          and id = any(${sql.array([...new Set(input.benchmarkResultIds)])}::bigint[])
          and benchmark_type = 'agentic_traces' and conc = ${conc}
      )
      update benchmark_results set power_audit = ${sql.json(audit)}::jsonb
      where id in (select id from candidates)
        and (select count(*) from candidates) = 1 and power_audit is null
      returning id
    `;
    updated.push(...rows.map((row) => Number(row.id)));
  }
  return updated;
}
