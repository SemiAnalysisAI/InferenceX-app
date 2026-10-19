import type { DbClient } from '../connection.js';
import { buildDatasetFromNeutral } from '../collectivex/reader';
import type { CollectiveXDataset, CollectiveXRunSummary } from '../collectivex/types';

/** One cx_runs row with its raw documents, ready for reader assembly. */
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

/** Row metadata + raw docs as written by the lazy ingest. */
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

/**
 * Known-run state. Runs are discovered lazily from GitHub on read, so a
 * deleted run keeps a tombstoned cx_runs row — otherwise the next discovery
 * pass would re-ingest it.
 */
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

/**
 * The most recent visible live run for a version. Zero-case summaries contain
 * no AMD/NVIDIA data and stay hidden. Ordered by run_id — GitHub run ids
 * increase monotonically with creation, matching lazy discovery's newest-first
 * walk (completion time would let a long-failing older run shadow a newer
 * successful one).
 *
 * Row and documents come back in ONE query, with docs filtered to the row's
 * CURRENT run_attempt: a reader can never observe one attempt's metadata with
 * another attempt's documents, even while a refresh commits concurrently.
 */
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

/**
 * One specific visible live run by id, or null when absent, tombstoned, on
 * another version, or carrying no supported-vendor cases.
 */
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

/**
 * Every visible live run summary for a version, newest-first, straight from
 * the precomputed `summary` column — no document loading. Runs whose reader
 * summary contains no AMD/NVIDIA cases stay hidden.
 */
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

/** State of each known run id (live or tombstoned); absent ids are omitted. */
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

/**
 * Atomically persist one run and its raw documents in a single statement
 * (data-modifying CTEs), so concurrent lazy ingests can race safely:
 * `ON CONFLICT DO NOTHING` turns the loser into a clean no-op, and a partial
 * run can never become visible. Returns true when this call inserted the run.
 *
 * The `::jsonb`-cast parameters must be raw objects: both drivers
 * JSON-serialize objects exactly once, while pre-stringified values get
 * double-encoded by postgres.js. `docs` is wrapped in an object because the
 * neon driver would serialize a bare JS array as a Postgres array literal.
 */
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

/**
 * Replace a live run's contents when GitHub reports a NEWER attempt (a re-run
 * of failed shards after the run was already ingested). Single statement with
 * `FOR UPDATE` + an attempt guard: concurrent refreshers serialize on the row
 * lock and the loser re-evaluates the guard to a no-op. Readers filter docs
 * by the row's current run_attempt, so any superseded docs this statement's
 * snapshot could not see (and therefore could not DELETE) stay invisible until
 * the next refresh garbage-collects them. Tombstoned runs are never refreshed.
 * Returns true when replaced.
 */
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

/**
 * Tombstone a run: mark it deleted (so lazy discovery never re-ingests it)
 * and drop its documents to free space — one atomic statement, so a partial
 * failure can never tombstone the run while leaving its documents orphaned
 * behind an unretryable 404. Returns false when the run is absent or already
 * tombstoned. Re-ingesting via the CLI intentionally clears the tombstone
 * (operator override; its hard DELETE also cascades any leftover docs).
 */
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

/** Assemble a stored run's raw documents into the dashboard dataset. */
export function collectiveXDatasetFromRow(row: CollectiveXRunRow): CollectiveXDataset {
  return buildDatasetFromNeutral(row.matrix, row.docs, {
    run_id: row.run_id,
    run_attempt: row.run_attempt,
    generated_at: row.generated_at,
    conclusion: row.conclusion,
    source_sha: row.source_sha,
  });
}
