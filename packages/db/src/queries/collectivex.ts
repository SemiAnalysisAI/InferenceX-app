import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import type { ChangelogLinkRow } from '../collectivex/changelog';
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
  /** From the stored summary. Null for runs from SemiAnalysisAI/InferenceX. */
  source_repository: string | null;
  conclusion: string | null;
  matrix: unknown;
  docs: unknown[];
}

/** One uploaded run's cx_runs row (see collectivex/results-upload.ts). */
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

function toRunRow(row: Record<string, unknown>): CollectiveXRunRow {
  const { docs, ...rest } = row as unknown as Omit<CollectiveXRunRow, 'docs'> & { docs: unknown };
  return { ...rest, docs: Array.isArray(docs) ? docs : [] };
}

/**
 * The most recent visible run for a version. A run is visible when its summary
 * requests AMD/NVIDIA cases AND measured at least one of them; the ingest never
 * stores an unmeasured run, and this keeps any such row hidden regardless.
 * Ordered by run_id, which every upload raises past the highest stored id, so
 * the newest upload is the latest run.
 *
 * Row and documents come back in ONE query, with docs filtered to the row's
 * run_attempt, so a reader never mixes one ingest's row with another's docs.
 */
export async function getLatestCollectiveXRun(
  sql: DbClient,
  version: number,
): Promise<CollectiveXRunRow | null> {
  const rows = await sql`
    SELECT r.run_id::text, r.run_attempt, r.version,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
      r.source_sha, r.source_branch, r.summary->>'source_repository' AS source_repository,
      r.conclusion, r.matrix,
      COALESCE(d.docs, '[]'::jsonb) AS docs
    FROM cx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(doc ORDER BY id) AS docs
      FROM cx_run_docs
      WHERE run_id = r.run_id AND run_attempt = r.run_attempt
    ) d ON true
    WHERE r.version = ${version}
      AND COALESCE((r.summary->>'requested_cases')::int, 0) > 0
      AND COALESCE((r.summary->>'measured_cases')::int, 0) > 0
    ORDER BY r.run_id DESC
    LIMIT 1
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

/**
 * One specific visible run by id, or null when absent, on another version, or
 * carrying no measured supported-vendor cases.
 */
export async function getCollectiveXRun(
  sql: DbClient,
  version: number,
  runId: string,
): Promise<CollectiveXRunRow | null> {
  const rows = await sql`
    SELECT r.run_id::text, r.run_attempt, r.version,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
      r.source_sha, r.source_branch, r.summary->>'source_repository' AS source_repository,
      r.conclusion, r.matrix,
      COALESCE(d.docs, '[]'::jsonb) AS docs
    FROM cx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(doc ORDER BY id) AS docs
      FROM cx_run_docs
      WHERE run_id = r.run_id AND run_attempt = r.run_attempt
    ) d ON true
    WHERE r.version = ${version} AND r.run_id = ${runId}
      AND COALESCE((r.summary->>'requested_cases')::int, 0) > 0
      AND COALESCE((r.summary->>'measured_cases')::int, 0) > 0
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

/**
 * Every visible run summary for a version, newest-first, straight from
 * the precomputed `summary` column — no document loading. Runs whose reader
 * summary requests or measures no AMD/NVIDIA cases stay hidden.
 */
export async function listCollectiveXRuns(
  sql: DbClient,
  version: number,
): Promise<CollectiveXRunSummary[]> {
  const rows = await sql`
    SELECT summary
    FROM cx_runs
    WHERE version = ${version}
      AND COALESCE((summary->>'requested_cases')::int, 0) > 0
      AND COALESCE((summary->>'measured_cases')::int, 0) > 0
    ORDER BY run_id DESC
  `;
  return rows.map((row) => row.summary as CollectiveXRunSummary);
}

/** The highest run_id stored in any version, visible or not; null when nothing is stored. */
export async function getMaxCollectiveXRunId(sql: DbClient): Promise<string | null> {
  const rows = await sql`SELECT max(run_id)::text AS run_id FROM cx_runs`;
  return (rows[0]?.run_id as string | null | undefined) ?? null;
}

export type CollectiveXUpsertResult = 'inserted' | 'replaced' | 'conflict' | 'stale';

// Every CollectiveX write below first takes the transaction-scoped advisory lock
// `pg_advisory_xact_lock(7384110219)` (an arbitrary fixed key), so ingests and
// deletions run one at a time. Without it two concurrent writes of one run each
// delete only the documents visible to their snapshot and then both insert, storing
// every document twice.

/**
 * Store one run and its raw documents in one transaction: take the write lock,
 * then one statement (data-modifying CTEs) upserts the row and replaces its
 * documents. Readers see the previous contents or the new ones, never a partial
 * run, and concurrent writes of the same run serialize on the lock, so the
 * second one's DELETE sees and removes the first one's documents. Writing a
 * run_id again with the same source_sha replaces its row and documents.
 * `conflict` means run_id already belongs to a different source_sha; nothing is
 * written.
 *
 * With `expectedMaxRunId` (the upload passes the highest run_id it merged
 * against, or null for an empty table), the write happens only if that is still
 * the highest stored run_id under the lock; otherwise it returns `stale` and
 * writes nothing, so two concurrent uploads cannot each drop the other's cases.
 *
 * The `::jsonb`-cast parameters must be raw objects: both drivers
 * JSON-serialize objects exactly once, while pre-stringified values get
 * double-encoded by postgres.js. `docs` is wrapped in an object because the
 * neon driver would serialize a bare JS array as a Postgres array literal.
 */
export async function upsertCollectiveXRun(
  sql: Sql,
  run: CollectiveXRunInsert,
  docs: unknown[],
  { expectedMaxRunId }: { expectedMaxRunId?: string | null } = {},
): Promise<CollectiveXUpsertResult> {
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7384110219)`;
    if (expectedMaxRunId !== undefined) {
      const [current] = await tx`SELECT max(run_id)::text AS run_id FROM cx_runs`;
      if ((current?.run_id ?? null) !== expectedMaxRunId) return null;
    }
    return tx`
      WITH upserted AS (
        INSERT INTO cx_runs
          (run_id, run_attempt, version, generated_at, source_sha, source_branch, conclusion, matrix, summary)
        VALUES
          (${run.run_id}, ${run.run_attempt}, ${run.version}, ${run.generated_at},
           ${run.source_sha}, ${run.source_branch}, ${run.conclusion},
           ${run.matrix as never}::jsonb, ${run.summary as never}::jsonb)
        ON CONFLICT (run_id) DO UPDATE SET
          run_attempt = EXCLUDED.run_attempt,
          version = EXCLUDED.version,
          generated_at = EXCLUDED.generated_at,
          source_branch = EXCLUDED.source_branch,
          conclusion = EXCLUDED.conclusion,
          matrix = EXCLUDED.matrix,
          summary = EXCLUDED.summary,
          ingested_at = now()
        WHERE cx_runs.source_sha = EXCLUDED.source_sha
        RETURNING run_id, (xmax = 0) AS inserted
      ),
      removed AS (
        DELETE FROM cx_run_docs WHERE run_id IN (SELECT run_id FROM upserted)
      ),
      new_docs AS (
        INSERT INTO cx_run_docs (run_id, run_attempt, doc)
        SELECT upserted.run_id, ${run.run_attempt}, entries.value
        FROM upserted, jsonb_array_elements((${{ docs } as never}::jsonb)->'docs') AS entries(value)
        RETURNING id
      )
      SELECT inserted FROM upserted
    `;
  });
  if (rows === null) return 'stale';
  if (rows.length === 0) return 'conflict';
  return rows[0].inserted ? 'inserted' : 'replaced';
}

/** A stored run (any version) with its documents, for linking changelog entries to it later. */
export async function getStoredCollectiveXRun(
  sql: DbClient,
  runId: string,
): Promise<(CollectiveXRunRow & { previous_run_id: string | null }) | null> {
  const rows = await sql`
    SELECT r.run_id::text, r.run_attempt, r.version,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
      r.source_sha, r.source_branch, r.summary->>'source_repository' AS source_repository,
      r.conclusion, r.matrix,
      COALESCE(d.docs, '[]'::jsonb) AS docs,
      (SELECT p.run_id::text FROM cx_runs p
       WHERE p.version = r.version AND p.run_id < r.run_id
       ORDER BY p.run_id DESC LIMIT 1) AS previous_run_id
    FROM cx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(doc ORDER BY id) AS docs
      FROM cx_run_docs
      WHERE run_id = r.run_id AND run_attempt = r.run_attempt
    ) d ON true
    WHERE r.run_id = ${runId}
  `;
  if (rows.length === 0) return null;
  const { previous_run_id, ...row } = rows[0] as Record<string, unknown>;
  return { ...toRunRow(row), previous_run_id: (previous_run_id as string | null) ?? null };
}

/** Store (or refresh) the changelog entries a run publishes. */
export async function upsertCollectiveXChangelogLinks(
  sql: Sql,
  rows: ChangelogLinkRow[],
): Promise<number> {
  let written = 0;
  for (const row of rows) {
    const result = await sql`
      INSERT INTO cx_changelog_entries
        (run_id, entry_index, pr_number, pr_link, date, pools, selectors, description,
         description_zh, changelog_sha, changes)
      VALUES
        (${row.run_id}, ${row.entry_index}, ${row.pr_number}, ${row.pr_link}, ${row.date},
         ${sql.array(row.pools)}, ${row.selectors as never}::jsonb, ${row.description}, ${row.description_zh},
         ${row.changelog_sha}, ${{ changes: row.changes } as never}::jsonb->'changes')
      ON CONFLICT (run_id, entry_index) DO UPDATE SET
        pr_number = EXCLUDED.pr_number,
        pr_link = EXCLUDED.pr_link,
        date = EXCLUDED.date,
        pools = EXCLUDED.pools,
        selectors = EXCLUDED.selectors,
        description = EXCLUDED.description,
        description_zh = EXCLUDED.description_zh,
        changelog_sha = EXCLUDED.changelog_sha,
        changes = EXCLUDED.changes,
        linked_at = now()
      RETURNING id
    `;
    written += result.length;
  }
  return written;
}

/** A stored run removed by a deletion. */
export interface CollectiveXRemovedRun {
  run_id: string;
  source_sha: string;
}

/** Delete one stored run and its documents; null when no such run is stored. */
export async function deleteCollectiveXRun(
  sql: Sql,
  runId: string,
): Promise<CollectiveXRemovedRun | null> {
  const rows = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7384110219)`;
    return tx`DELETE FROM cx_runs WHERE run_id = ${runId} RETURNING run_id::text, source_sha`;
  });
  return rows.length === 0 ? null : (rows[0] as unknown as CollectiveXRemovedRun);
}

/** Assemble a stored run's raw documents into the dashboard dataset. */
export function collectiveXDatasetFromRow(row: CollectiveXRunRow): CollectiveXDataset {
  return buildDatasetFromNeutral(row.matrix, row.docs, {
    run_id: row.run_id,
    run_attempt: row.run_attempt,
    generated_at: row.generated_at,
    conclusion: row.conclusion,
    source_sha: row.source_sha,
    source_repository: row.source_repository ?? undefined,
  });
}
