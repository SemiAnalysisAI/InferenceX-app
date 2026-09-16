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
  const rows = await sql`SELECT summary,
    CASE WHEN summary->>'_reader_version' = '2' THEN NULL ELSE bundle END AS legacy_bundle
    FROM opx_runs ORDER BY run_id DESC`;
  const summaries: OperatorXRunSummary[] = [];
  for (const row of rows) {
    const { _reader_version: _version, ...storedRun } = row.summary as OperatorXRunSummary & {
      _reader_version: number;
    };
    let run = storedRun;
    if (row.legacy_bundle) {
      // Rebuild old GEMM-only summaries from durable raw data, even after artifact expiry.
      run = readOperatorXBundle(row.legacy_bundle as OperatorXBundle).run;
      const summary = { ...run, _reader_version: 2 };
      await sql`UPDATE opx_runs SET summary = ${summary}::jsonb
        WHERE run_id = ${run.run_id} AND run_attempt = ${run.run_attempt}
          AND summary->>'_reader_version' IS DISTINCT FROM '2'`;
    }
    summaries.push(run);
  }
  return summaries;
}
export async function saveOperatorXBundle(sql: DbClient, bundle: OperatorXBundle): Promise<void> {
  const { run } = readOperatorXBundle(bundle);
  const summary = { ...run, _reader_version: 2 };
  await sql`INSERT INTO opx_runs (run_id, run_attempt, bundle, summary)
    VALUES (${run.run_id}, ${run.run_attempt}, ${bundle}::jsonb, ${summary}::jsonb)
    ON CONFLICT (run_id) DO UPDATE SET run_attempt = EXCLUDED.run_attempt,
      bundle = EXCLUDED.bundle, summary = EXCLUDED.summary, updated_at = now()
    WHERE opx_runs.run_attempt < EXCLUDED.run_attempt`;
}
