import type { DbClient } from '../connection';
import {
  readOperatorXBundle,
  type OperatorXBundle,
  type OperatorXRunSummary,
} from '../operatorx/reader';

export async function getOperatorXBundle(
  sql: DbClient,
  runId: string,
): Promise<OperatorXBundle | null> {
  const rows = await sql`SELECT bundle FROM opx_runs WHERE run_id = ${runId}`;
  return (rows[0]?.bundle as OperatorXBundle | undefined) ?? null;
}
export async function listOperatorXRuns(sql: DbClient): Promise<OperatorXRunSummary[]> {
  const rows = await sql`SELECT summary FROM opx_runs ORDER BY run_id DESC`;
  return rows.map((row) => row.summary as OperatorXRunSummary);
}
export async function saveOperatorXBundle(sql: DbClient, bundle: OperatorXBundle): Promise<void> {
  const { run } = readOperatorXBundle(bundle);
  await sql`INSERT INTO opx_runs (run_id, run_attempt, bundle, summary)
    VALUES (${run.run_id}, ${run.run_attempt}, ${bundle}::jsonb, ${run}::jsonb)
    ON CONFLICT (run_id) DO UPDATE SET run_attempt = EXCLUDED.run_attempt,
      bundle = EXCLUDED.bundle, summary = EXCLUDED.summary, updated_at = now()
    WHERE opx_runs.run_attempt < EXCLUDED.run_attempt`;
}
