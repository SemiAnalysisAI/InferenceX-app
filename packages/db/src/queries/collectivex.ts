import type { DbClient } from '../connection.js';
import { buildDatasetFromNeutral } from '../collectivex/reader';
import type { CollectiveXDataset, CollectiveXRunSummary } from '../collectivex/types';

export interface CollectiveXRunRow {
  run_id: string;
  run_attempt: number;
  version: number;
  generated_at: string;
  source_sha: string;
  source_branch: string | null;
  conclusion: string | null;
  matrix: unknown;
  docs: unknown[];
}

export interface CollectiveXRunInsert {
  run_id: string;
  run_attempt: number;
  version: number;
  generated_at: string;
  source_sha: string;
  source_branch: string | null;
  conclusion: string | null;
  matrix: unknown;
  summary: CollectiveXRunSummary;
}

type CollectiveXRunState = 'live' | 'deleted';

interface CollectiveXRunStateRow {
  state: CollectiveXRunState;
  version: number;
  run_attempt: number;
}

function toRunRow(row: Record<string, unknown>): CollectiveXRunRow {
  const { docs, ...rest } = row as unknown as Omit<CollectiveXRunRow, 'docs'> & { docs: unknown };
  return { ...rest, docs: Array.isArray(docs) ? docs : [] };
}

export async function getLatestCollectiveXRun(
  sql: DbClient,
  version: number,
): Promise<CollectiveXRunRow | null> {
  const rows = await sql`
    SELECT r.run_id::text, r.run_attempt, r.version,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
      r.source_sha, r.source_branch, r.conclusion, r.matrix,
      COALESCE(d.docs, '[]'::jsonb) AS docs
    FROM cx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(doc ORDER BY id) AS docs
      FROM cx_run_docs
      WHERE run_id = r.run_id AND run_attempt = r.run_attempt
    ) d ON true
    WHERE r.version = ${version} AND r.deleted_at IS NULL
      AND COALESCE((r.summary->>'requested_cases')::int, 0) > 0
    ORDER BY r.run_id DESC
    LIMIT 1
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

export async function getCollectiveXRun(
  sql: DbClient,
  version: number,
  runId: string,
): Promise<CollectiveXRunRow | null> {
  const rows = await sql`
    SELECT r.run_id::text, r.run_attempt, r.version,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
      r.source_sha, r.source_branch, r.conclusion, r.matrix,
      COALESCE(d.docs, '[]'::jsonb) AS docs
    FROM cx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(doc ORDER BY id) AS docs
      FROM cx_run_docs
      WHERE run_id = r.run_id AND run_attempt = r.run_attempt
    ) d ON true
    WHERE r.version = ${version} AND r.run_id = ${runId} AND r.deleted_at IS NULL
      AND COALESCE((r.summary->>'requested_cases')::int, 0) > 0
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

export async function listCollectiveXRuns(
  sql: DbClient,
  version: number,
): Promise<CollectiveXRunSummary[]> {
  const rows = await sql`
    SELECT summary
    FROM cx_runs
    WHERE version = ${version} AND deleted_at IS NULL
      AND COALESCE((summary->>'requested_cases')::int, 0) > 0
    ORDER BY run_id DESC
  `;
  return rows.map((row) => row.summary as CollectiveXRunSummary);
}

export async function getCollectiveXRunStates(
  sql: DbClient,
  runIds: readonly string[],
): Promise<Record<string, CollectiveXRunStateRow>> {
  if (runIds.length === 0) return {};
  const rows = await sql`
    SELECT run_id::text, version, run_attempt, (deleted_at IS NOT NULL) AS deleted
    FROM cx_runs
    WHERE run_id = ANY(${runIds as string[]}::bigint[])
  `;
  return Object.fromEntries(
    rows.map((row) => [
      row.run_id as string,
      {
        state: row.deleted ? 'deleted' : 'live',
        version: row.version as number,
        run_attempt: row.run_attempt as number,
      },
    ]),
  );
}

export async function insertCollectiveXRun(
  sql: DbClient,
  run: CollectiveXRunInsert,
  docs: unknown[],
): Promise<boolean> {
  const rows = await sql`
    WITH new_run AS (
      INSERT INTO cx_runs
        (run_id, run_attempt, version, generated_at, source_sha, source_branch, conclusion, matrix, summary)
      VALUES
        (${run.run_id}, ${run.run_attempt}, ${run.version}, ${run.generated_at},
         ${run.source_sha}, ${run.source_branch}, ${run.conclusion},
         ${run.matrix as never}::jsonb, ${run.summary as never}::jsonb)
      ON CONFLICT (run_id) DO NOTHING
      RETURNING run_id
    ),
    new_docs AS (
      INSERT INTO cx_run_docs (run_id, run_attempt, doc)
      SELECT new_run.run_id, ${run.run_attempt}, entries.value
      FROM new_run, jsonb_array_elements((${{ docs } as never}::jsonb)->'docs') AS entries(value)
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM new_run) AS runs_inserted
  `;
  return (rows[0]?.runs_inserted as number) > 0;
}

export async function refreshCollectiveXRunAttempt(
  sql: DbClient,
  run: CollectiveXRunInsert,
  docs: unknown[],
): Promise<boolean> {
  const rows = await sql`
    WITH target AS (
      SELECT run_id FROM cx_runs
      WHERE run_id = ${run.run_id} AND deleted_at IS NULL AND run_attempt < ${run.run_attempt}
      FOR UPDATE
    ),
    removed AS (
      DELETE FROM cx_run_docs WHERE run_id IN (SELECT run_id FROM target)
    ),
    updated AS (
      UPDATE cx_runs SET
        run_attempt = ${run.run_attempt},
        generated_at = ${run.generated_at},
        source_sha = ${run.source_sha},
        source_branch = ${run.source_branch},
        conclusion = ${run.conclusion},
        matrix = ${run.matrix as never}::jsonb,
        summary = ${run.summary as never}::jsonb,
        ingested_at = now()
      WHERE run_id IN (SELECT run_id FROM target)
      RETURNING run_id
    ),
    new_docs AS (
      INSERT INTO cx_run_docs (run_id, run_attempt, doc)
      SELECT updated.run_id, ${run.run_attempt}, entries.value
      FROM updated, jsonb_array_elements((${{ docs } as never}::jsonb)->'docs') AS entries(value)
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM updated) AS runs_updated
  `;
  return (rows[0]?.runs_updated as number) > 0;
}

export async function deleteCollectiveXRun(sql: DbClient, runId: string): Promise<boolean> {
  const rows = await sql`
    WITH tombstoned AS (
      UPDATE cx_runs SET deleted_at = now()
      WHERE run_id = ${runId} AND deleted_at IS NULL
      RETURNING run_id
    ),
    removed AS (
      DELETE FROM cx_run_docs WHERE run_id IN (SELECT run_id FROM tombstoned)
    )
    SELECT (SELECT count(*)::int FROM tombstoned) AS runs_deleted
  `;
  return (rows[0]?.runs_deleted as number) > 0;
}

export function collectiveXDatasetFromRow(row: CollectiveXRunRow): CollectiveXDataset {
  return buildDatasetFromNeutral(row.matrix, row.docs, {
    run_id: row.run_id,
    run_attempt: row.run_attempt,
    generated_at: row.generated_at,
    conclusion: row.conclusion,
    source_sha: row.source_sha,
  });
}
