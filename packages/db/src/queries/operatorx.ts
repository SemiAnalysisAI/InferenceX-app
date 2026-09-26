/**
 * The OperatorX database: runs as raw bundles (opx_runs + opx_run_docs). Reads rebuild
 * the exact `OperatorXRawBundle` a source returns; writes take one and store it
 * verbatim, with the run-list summary precomputed.
 */
import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import {
  type OperatorXRawBundle,
  type OperatorXRunRef,
  planFromManifest,
} from '../operatorx/bundle';
import { normalizeBundle } from '../operatorx/normalize';

const DOCS_INSERT_CHUNK = 20; // result documents are a few MB each

/** A run key is whatever the ingester chose; keep it URL- and log-safe. */
export const RUN_KEY_RE = /^[\w.-]{1,128}$/u;

/** Every run, newest first, from the precomputed summaries alone. */
export async function listOperatorXRuns(sql: DbClient): Promise<OperatorXRunRef[]> {
  const rows = await sql`SELECT id, summary FROM opx_runs ORDER BY generated_at DESC, id DESC`;
  return rows.map((r) => ({ ...(r.summary as OperatorXRunRef), revision: String(r.id) }));
}

/**
 * One run's bundle, or null. Row and documents come back in one query. A shard keeps
 * the attempt that produced it (a partial rerun reuses earlier attempts' shards), and a
 * re-ingest replaces the whole run, so every stored document belongs to it.
 */
export async function getOperatorXBundle(
  sql: DbClient,
  runKey: string,
): Promise<OperatorXRawBundle | null> {
  const rows = await sql`
    SELECT r.id, r.run_key, r.run_attempt,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at,
      r.source_sha, r.source_branch, r.conclusion, r.manifest,
      COALESCE(d.shards, '[]'::jsonb) AS shards
    FROM opx_runs r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', shard, 'attempt', run_attempt, 'docs', docs)
                       ORDER BY shard) AS shards
      FROM (
        SELECT shard, run_attempt, jsonb_agg(doc ORDER BY id) AS docs
        FROM opx_run_docs
        WHERE run_id = r.id
        GROUP BY shard, run_attempt
      ) s
    ) d ON true
    WHERE r.run_key = ${runKey}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    run: {
      run_id: String(r.run_key),
      run_attempt: Number(r.run_attempt),
      revision: String(r.id),
      source_sha: String(r.source_sha),
      source_branch: (r.source_branch as string | null) ?? null,
      generated_at: String(r.generated_at),
      conclusion: (r.conclusion as string | null) ?? null,
    },
    manifest: r.manifest,
    shards: r.shards as OperatorXRawBundle['shards'],
  };
}

/** The run list's entry for a bundle: its metadata plus the planned coverage. */
export function runSummary(bundle: OperatorXRawBundle): OperatorXRunRef {
  return { ...bundle.run, plan: planFromManifest(bundle.manifest) ?? undefined };
}

/**
 * Store a bundle under its `run.run_id`, replacing any earlier ingest of that run. The
 * bundle is normalized first, so one that cannot be read is never stored.
 */
export async function saveOperatorXBundle(
  sql: Sql,
  bundle: OperatorXRawBundle,
): Promise<{ docs: number; results: number }> {
  const key = bundle.run.run_id;
  if (!RUN_KEY_RE.test(key)) throw new Error(`Invalid run key: ${key}`);
  const { results } = normalizeBundle(bundle);
  if (planFromManifest(bundle.manifest) === null) throw new Error(`Run ${key} has no manifest`);
  const summary = runSummary(bundle);
  const { run } = bundle;
  let docs = 0;
  await sql.begin(async (tx) => {
    await tx`DELETE FROM opx_runs WHERE run_key = ${key}`;
    // The ::jsonb casts type the parameters as jsonb, so postgres.js serializes the
    // objects itself; pre-stringifying would double-encode them into jsonb strings.
    const [{ id }] = await tx`
      INSERT INTO opx_runs
        (run_key, run_attempt, generated_at, source_sha, source_branch, conclusion, manifest, summary)
      VALUES
        (${key}, ${run.run_attempt}, ${run.generated_at}, ${run.source_sha}, ${run.source_branch},
         ${run.conclusion}, ${bundle.manifest as never}::jsonb, ${summary as never}::jsonb)
      RETURNING id
    `;
    for (const shard of bundle.shards) {
      for (let i = 0; i < shard.docs.length; i += DOCS_INSERT_CHUNK) {
        const chunk = shard.docs.slice(i, i + DOCS_INSERT_CHUNK).map((d) => JSON.stringify(d));
        await tx`
          INSERT INTO opx_run_docs (run_id, run_attempt, shard, doc)
          SELECT ${id}, ${shard.attempt}, ${shard.id}, unnest(${tx.array(chunk)}::jsonb[])
        `;
        docs += chunk.length;
      }
    }
  });
  return { docs, results: results.length };
}
