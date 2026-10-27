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
  /** From the stored summary. Null for runs from SemiAnalysisAI/InferenceX. */
  source_repository: string | null;
  conclusion: string | null;
  matrix: unknown;
  docs: unknown[];
}

/** One results commit's cx_runs row (see collectivex/committed-results.ts). */
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
 * The most recent visible run for a version. Zero-case summaries contain no
 * AMD/NVIDIA data and stay hidden. Ordered by run_id, the results commit's
 * time in epoch seconds, so the newest commit on main is the latest run.
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
    ORDER BY r.run_id DESC
    LIMIT 1
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

/**
 * One specific visible run by id, or null when absent, on another version, or
 * carrying no supported-vendor cases.
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
  `;
  return rows.length === 0 ? null : toRunRow(rows[0]);
}

/**
 * Every visible run summary for a version, newest-first, straight from
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
    WHERE version = ${version}
      AND COALESCE((summary->>'requested_cases')::int, 0) > 0
    ORDER BY run_id DESC
  `;
  return rows.map((row) => row.summary as CollectiveXRunSummary);
}

export type CollectiveXUpsertResult = 'inserted' | 'replaced' | 'conflict';

/**
 * Store one results commit and its raw documents in a single statement
 * (data-modifying CTEs), so a reader sees either the previous contents or the
 * new ones, never a partial run. Re-ingesting the same commit replaces its row
 * and documents. `conflict` means run_id already belongs to a different commit
 * (two results commits landed in the same second); nothing is written.
 *
 * The `::jsonb`-cast parameters must be raw objects: both drivers
 * JSON-serialize objects exactly once, while pre-stringified values get
 * double-encoded by postgres.js. `docs` is wrapped in an object because the
 * neon driver would serialize a bare JS array as a Postgres array literal.
 */
export async function upsertCollectiveXRun(
  sql: DbClient,
  run: CollectiveXRunInsert,
  docs: unknown[],
): Promise<CollectiveXUpsertResult> {
  const rows = await sql`
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
  if (rows.length === 0) return 'conflict';
  return rows[0].inserted ? 'inserted' : 'replaced';
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
