import type { TransactionSql } from 'postgres';

import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import {
  type OperatorXRawBundle,
  type OperatorXRunRef,
  planFromManifest,
} from '../operatorx/bundle';
import { normalizeBundle } from '../operatorx/normalize';
import type { Comparison, ComparisonOp } from '../operatorx/compare';
import { buildRunComparison, OPERATORX_COMPARISON_VERSION } from '../operatorx/comparison-cache';

const DOCS_INSERT_CHUNK = 20;
const DOCS_READ_BATCH = 8;

export const RUN_KEY_RE = /^[\w.-]{1,128}$/u;

export async function listOperatorXRuns(sql: DbClient): Promise<OperatorXRunRef[]> {
  const rows = await sql`SELECT id, summary FROM opx_runs ORDER BY generated_at DESC, id DESC`;
  return rows.map((r) => ({ ...(r.summary as OperatorXRunRef), revision: String(r.id) }));
}

export async function getOperatorXBundle(
  sql: DbClient,
  runKey: string,
): Promise<OperatorXRawBundle | null> {
  const rows = await sql`
    SELECT r.id, r.run_key, r.run_attempt,
      to_char(r.generated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS generated_at,
      r.source_sha, r.source_branch, r.conclusion, r.manifest
    FROM opx_runs r
    WHERE r.run_key = ${runKey}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const shards: OperatorXRawBundle['shards'] = [];
  let lastShard = '';
  let lastId = '0';
  for (;;) {
    const docs = await sql`
      SELECT id, shard, run_attempt, doc FROM opx_run_docs
      WHERE run_id = ${r.id}
        AND (shard > ${lastShard} OR (shard = ${lastShard} AND id > ${lastId}))
      ORDER BY shard, id LIMIT ${DOCS_READ_BATCH}
    `;
    for (const doc of docs) {
      const shardId = String(doc.shard);
      const attempt = Number(doc.run_attempt);
      const prior = shards.at(-1);
      if (prior?.id === shardId && prior.attempt === attempt) prior.docs.push(doc.doc);
      else shards.push({ id: shardId, attempt, docs: [doc.doc] });
      lastShard = shardId;
      lastId = String(doc.id);
    }
    if (docs.length < DOCS_READ_BATCH) break;
  }
  // A concurrent re-ingest replaces the revision and its documents atomically.
  // Do not return a partially read bundle from the replaced revision.
  const current = await sql`SELECT id FROM opx_runs WHERE run_key = ${runKey}`;
  if (current.length !== 1 || String(current[0].id) !== String(r.id))
    throw new Error(`Run ${runKey} changed during document read`);
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
    shards,
  };
}

export function runSummary(bundle: OperatorXRawBundle): OperatorXRunRef {
  return { ...bundle.run, plan: planFromManifest(bundle.manifest) ?? undefined };
}

/** Older databases and unbackfilled revisions continue through the raw reader. */
export async function getOperatorXRunComparison(
  sql: DbClient,
  runKey: string,
  op: ComparisonOp,
): Promise<Comparison | null> {
  const comparisons = await getOperatorXRunComparisons(sql, [{ run_id: runKey }], op);
  return comparisons.get(runKey) ?? null;
}

/** Read the listed revisions in one query; absent/old projections use raw fallback. */
export async function getOperatorXRunComparisons(
  sql: DbClient,
  runs: Pick<OperatorXRunRef, 'run_id' | 'revision'>[],
  op: ComparisonOp,
): Promise<Map<string, Comparison>> {
  if (runs.length === 0) return new Map();
  const requested = JSON.stringify(
    runs.map((run) => ({
      run_key: run.run_id,
      revision: run.revision ?? null,
    })),
  );
  try {
    const rows = await sql`
      SELECT r.run_key, c.comparison
      FROM jsonb_to_recordset(${requested}::jsonb) AS requested(run_key text, revision text)
      JOIN opx_runs r ON r.run_key = requested.run_key
        AND (requested.revision IS NULL OR r.id::text = requested.revision)
      JOIN opx_run_comparisons c ON c.run_id = r.id
      WHERE c.op = ${op} AND c.format_version = ${OPERATORX_COMPARISON_VERSION}
    `;
    return new Map(rows.map((row) => [String(row.run_key), row.comparison as Comparison]));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01')
      return new Map();
    throw error;
  }
}

async function writeRunComparisons(
  tx: TransactionSql,
  dataset: ReturnType<typeof normalizeBundle>,
  runner: string,
  revision: string,
): Promise<void> {
  dataset.run.revision = revision;
  for (const op of ['gemm', 'moe'] as const) {
    const comparison = buildRunComparison(op, { runner, dataset });
    await tx`
      INSERT INTO opx_run_comparisons (run_id, op, format_version, comparison)
      VALUES (${revision}, ${op}, ${OPERATORX_COMPARISON_VERSION},
              ${JSON.stringify(comparison)}::jsonb)
      ON CONFLICT (run_id, op) DO UPDATE
      SET format_version = EXCLUDED.format_version, comparison = EXCLUDED.comparison
    `;
  }
}

/** Backfill a captured revision without replacing its raw data or timeline identities. */
export async function backfillOperatorXRunComparisons(
  sql: Sql,
  bundle: OperatorXRawBundle,
): Promise<boolean> {
  const revision = bundle.run.revision;
  if (!revision) throw new Error('OperatorX comparison backfill requires a stored revision');
  const dataset = normalizeBundle(bundle);
  const plan = dataset.run.plan;
  if (!plan) throw new Error(`Run ${bundle.run.run_id} has no manifest`);
  return await sql.begin(async (tx) => {
    // A concurrent re-ingest either wins before this lock (no match), or waits and
    // cascades away this revision's projections when it replaces the raw run.
    const current = await tx`
      SELECT id FROM opx_runs
      WHERE run_key = ${bundle.run.run_id} AND id = ${revision}
      FOR UPDATE
    `;
    if (current.length === 0) return false;
    await writeRunComparisons(tx, dataset, plan.runner, revision);
    return true;
  });
}

export async function saveOperatorXBundle(
  sql: Sql,
  bundle: OperatorXRawBundle,
  replaceRunKey?: string,
): Promise<{ docs: number; results: number }> {
  const key = bundle.run.run_id;
  if (!RUN_KEY_RE.test(key)) throw new Error(`Invalid run key: ${key}`);
  const plan = planFromManifest(bundle.manifest);
  if (plan === null) throw new Error(`Run ${key} has no manifest`);
  const summary = runSummary(bundle);
  const { run } = bundle;
  let docs = 0;
  let results = 0;
  await sql.begin(async (tx) => {
    if (replaceRunKey && replaceRunKey !== key) {
      if (!RUN_KEY_RE.test(replaceRunKey))
        throw new Error(`Invalid replacement run key: ${replaceRunKey}`);
      const old = await tx`
        SELECT summary FROM opx_runs WHERE run_key = ${replaceRunKey} FOR UPDATE
      `;
      if (
        old.length !== 1 ||
        !String((old[0].summary as OperatorXRunRef).plan?.runner ?? '').startsWith('ascend950pr')
      )
        throw new Error(`Replacement target is not an Ascend 950PR run: ${replaceRunKey}`);
      if (!plan.runner.startsWith('ascend950pr'))
        throw new Error(`Replacement bundle is not an Ascend 950PR run: ${key}`);
      await tx`DELETE FROM opx_runs WHERE run_key = ${replaceRunKey}`;
    }
    await tx`DELETE FROM opx_runs WHERE run_key = ${key}`;
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
    // Use the authoritative reader's shard/doc order, timestamps and revision.
    // Input artifact order can differ; projecting it would change tie winners and
    // make resultIndex point at a different kernel timeline after persistence.
    const stored = await getOperatorXBundle(tx as unknown as DbClient, key);
    if (!stored) throw new Error(`Run ${key} disappeared during ingest`);
    const dataset = normalizeBundle(stored);
    results = dataset.results.length;
    await writeRunComparisons(tx, dataset, plan.runner, String(id));
  });
  return { docs, results };
}
