/**
 * Bulk DB insert functions for `benchmark_results` and `run_stats`.
 */

import fs from 'node:fs';
import path from 'node:path';

import type postgres from 'postgres';
import { cleanLogText, type ServerLogFile, type ServerLogFilePath } from './server-log-artifacts';
import type { BenchmarkType, WorkerPower } from './benchmark-mapper';
import { kvCachePoolTokensFromServerLog } from './server-log-metrics';

type Sql = ReturnType<typeof postgres>;

export interface BenchmarkPersistenceInput {
  configId: number;
  benchmarkType: BenchmarkType;
  isl: number | null;
  osl: number | null;
  conc: number;
  offloadMode: string;
  image: string | null;
  recipeFingerprint: string | null;
  metrics: Record<string, number>;
  workers?: WorkerPower[];
}

type BenchmarkPointIdentity = Pick<
  BenchmarkPersistenceInput,
  'configId' | 'benchmarkType' | 'isl' | 'osl' | 'conc' | 'offloadMode' | 'recipeFingerprint'
>;

/** Stable in-batch identity matching benchmark_results_unique. */
export function benchmarkPointIngestKey(row: BenchmarkPointIdentity): string {
  return JSON.stringify([
    row.configId,
    row.benchmarkType,
    row.isl,
    row.osl,
    row.conc,
    row.offloadMode,
    row.recipeFingerprint,
  ]);
}

/**
 * Bulk-insert benchmark results for a single artifact in one DB round-trip using `UNNEST`.
 * Rows are deduplicated within the batch on the persisted point identity, including
 * the producer's recipe fingerprint when present, before sending because Postgres
 * rejects an `ON CONFLICT DO UPDATE` statement that
 * would update the same row twice in a single query.
 *
 * @param sql - Active `postgres` connection.
 * @param rows - Benchmark persistence fields with their resolved `configId`.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Counts of newly inserted rows and rows that hit the conflict path.
 */
export async function bulkIngestBenchmarkRows(
  sql: Sql,
  rows: BenchmarkPersistenceInput[],
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number; insertedIds: number[] }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0, insertedIds: [] };

  // Postgres rejects ON CONFLICT DO UPDATE if the same conflict key appears
  // more than once in a single batch. Deduplicate within the batch, keeping
  // the last occurrence for each unique recipe/config/scenario/concurrency point.
  const seen = new Map<string, BenchmarkPersistenceInput>();
  for (const r of rows) {
    seen.set(benchmarkPointIngestKey(r), r);
  }
  const deduped = [...seen.values()];

  const configIds = deduped.map((r) => r.configId);
  const benchmarkTypes = deduped.map((r) => r.benchmarkType);
  const offloadModes = deduped.map((r) => r.offloadMode);
  const isls = deduped.map((r) => r.isl);
  const osls = deduped.map((r) => r.osl);
  const concs = deduped.map((r) => r.conc);
  const images = deduped.map((r) => r.image);
  const recipeFingerprints = deduped.map((r) => r.recipeFingerprint);
  const metricsJsons = deduped.map((r) => JSON.stringify(r.metrics));
  // workers is optional — encode missing values as JSON null so the JSONB
  // unnest input has a homogeneous type (jsonb[]) and stores SQL NULL in the
  // column for rows that didn't emit a per-worker breakdown.
  const workersJsons = deduped.map((r) =>
    r.workers === undefined ? null : JSON.stringify(r.workers),
  );

  const result = await sql<{ inserted: boolean; id: number }[]>`
    insert into benchmark_results (
      workflow_run_id, config_id, benchmark_type, offload_mode, date,
      isl, osl, conc, image, recipe_fingerprint, metrics, workers
    )
    select
      ${workflowRunId},
      unnest(${sql.array(configIds)}::int[]),
      unnest(${sql.array(benchmarkTypes)}::text[]),
      unnest(${sql.array(offloadModes)}::text[]),
      ${date}::date,
      unnest(${sql.array(isls)}::int[]),
      unnest(${sql.array(osls)}::int[]),
      unnest(${sql.array(concs)}::int[]),
      unnest(${sql.array(images)}),
      unnest(${sql.array(recipeFingerprints)}),
      unnest(${sql.array(metricsJsons)}::jsonb[]),
      unnest(${sql.array(workersJsons)}::jsonb[])
    on conflict (
      workflow_run_id, config_id, benchmark_type, isl, osl, conc, offload_mode,
      recipe_fingerprint
    )
    do update set
      -- Replace metrics with the fresh artifact values, but carry over
      -- kv_cache_pool_tokens: it is derived from the server log at
      -- insertServerLog time (not present in any artifact JSON), so a later
      -- upsert from the aggregated results_bmk artifact would silently wipe it.
      metrics = excluded.metrics || jsonb_strip_nulls(
        jsonb_build_object('kv_cache_pool_tokens', benchmark_results.metrics->'kv_cache_pool_tokens')
      ),
      image = excluded.image,
      workers = excluded.workers
    returning (xmax = 0) as inserted, id
  `;

  const newCount = result.filter((r) => r.inserted).length;
  return { newCount, dupCount: deduped.length - newCount, insertedIds: result.map((r) => r.id) };
}

/**
 * Store every .log/.out file from one server-log artifact and link the bundle
 * to the given benchmark result IDs. Existing bundles receive only missing
 * filenames, making both normal ingest and the historical backfill idempotent.
 */
interface DeferredServerLogFile {
  fileName: string;
  readText: () => string;
}

function primaryDeferredServerLogFile(
  files: readonly DeferredServerLogFile[],
): DeferredServerLogFile | null {
  return (
    files.find((file) => path.posix.basename(file.fileName).toLowerCase() === 'server.log') ??
    files[0] ??
    null
  );
}

async function insertDeferredServerLogFiles(
  sql: Sql,
  benchmarkResultIds: number[],
  files: readonly DeferredServerLogFile[],
): Promise<void> {
  if (benchmarkResultIds.length === 0 || files.length === 0) return;

  const deduped = [...new Map(files.map((file) => [file.fileName, file])).values()];
  const primary = primaryDeferredServerLogFile(deduped);
  if (!primary) return;
  const additional = deduped.filter((file) => file.fileName !== primary.fileName);
  const primaryText = primary.readText();
  const serverLog =
    primary.fileName.toLowerCase().endsWith('/server.log') ||
    primary.fileName.toLowerCase() === 'server.log'
      ? primaryText
      : null;
  const kvCachePoolTokens = serverLog ? kvCachePoolTokensFromServerLog(serverLog) : null;

  await sql.begin(async (tx) => {
    const rows = await tx<{ id: number; server_log_id: number | null }[]>`
      select id, server_log_id from benchmark_results
      where id = any(${tx.array(benchmarkResultIds)}::bigint[])
      for update
    `;
    const unlinked = rows.filter((row) => row.server_log_id === null);
    const bundleIds = new Set(
      rows.flatMap((row) => (row.server_log_id === null ? [] : [Number(row.server_log_id)])),
    );

    if (unlinked.length > 0) {
      const [{ id: logId }] = await tx<{ id: number }[]>`
        insert into server_logs (server_log, file_name, files_complete)
        values (${primaryText}, ${primary.fileName}, true)
        returning id
      `;
      bundleIds.add(Number(logId));
      await tx`
        update benchmark_results
        set server_log_id = ${logId}
        where id = any(${tx.array(unlinked.map((row) => row.id))}::bigint[])
      `;
    }

    for (const logId of bundleIds) {
      // Legacy rows used the synthetic name server.log. Backfill upgrades that
      // label to the artifact-relative path without rewriting the large text.
      await tx`
        update server_logs
        set file_name = case
              when file_name = 'server.log' then ${primary.fileName}
              else file_name
            end,
            files_complete = true
        where id = ${logId}
      `;
      for (const file of additional) {
        const logText = file.readText();
        await tx`
          insert into server_log_files (server_log_id, file_name, log_text)
          values (${logId}, ${file.fileName}, ${logText})
          on conflict (server_log_id, file_name) do nothing
        `;
      }
    }

    // Derive the KV-cache pool size (tokens) from the authoritative server.log
    // when the artifact includes one. Multinode bundles without server.log are
    // still stored in full; they simply cannot contribute this derived metric.
    if (kvCachePoolTokens !== null) {
      await tx`
        update benchmark_results
        set metrics = jsonb_set(
          metrics,
          '{kv_cache_pool_tokens}',
          to_jsonb(${kvCachePoolTokens}::bigint)
        )
        where id = any(${tx.array(rows.map((row) => row.id))}::bigint[])
      `;
    }
  });
}

export async function insertServerLogFiles(
  sql: Sql,
  benchmarkResultIds: number[],
  files: readonly ServerLogFile[],
): Promise<void> {
  await insertDeferredServerLogFiles(
    sql,
    benchmarkResultIds,
    files.map((file) => ({ fileName: file.fileName, readText: () => file.logText })),
  );
}

/** Read archived log files one at a time so multinode bundles stay memory-bounded. */
export async function insertServerLogFilePaths(
  sql: Sql,
  benchmarkResultIds: number[],
  files: readonly ServerLogFilePath[],
): Promise<void> {
  await insertDeferredServerLogFiles(
    sql,
    benchmarkResultIds,
    files.map((file) => ({
      fileName: file.fileName,
      readText: () => cleanLogText(fs.readFileSync(file.path, 'utf8')),
    })),
  );
}

/** Compatibility wrapper for callers/tests that still provide one legacy stream. */
export async function insertServerLog(
  sql: Sql,
  benchmarkResultIds: number[],
  serverLog: string,
): Promise<void> {
  await insertServerLogFiles(sql, benchmarkResultIds, [
    { fileName: 'server.log', logText: serverLog },
  ]);
}

/**
 * Bulk-insert `run_stats` rows for one workflow run in a single DB round-trip.
 * Rows are deduplicated within the batch on `hardware` before sending.
 * On conflict the `n_success` and `total` counts are overwritten with the latest values.
 *
 * @param sql - Active `postgres` connection.
 * @param rows - Hardware success/total stats to insert.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Counts of newly inserted rows and rows that hit the conflict path.
 */
export async function bulkIngestRunStats(
  sql: Sql,
  rows: { hardware: string; nSuccess: number; total: number }[],
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0 };

  // Deduplicate on conflict key (workflow_run_id, hardware) — keep last occurrence.
  const seen = new Map<string, { hardware: string; nSuccess: number; total: number }>();
  for (const r of rows) seen.set(r.hardware, r);
  const deduped = [...seen.values()];

  const result = await sql<{ inserted: boolean }[]>`
    insert into run_stats (workflow_run_id, date, hardware, n_success, total)
    select
      ${workflowRunId},
      ${date}::date,
      unnest(${sql.array(deduped.map((r) => r.hardware))}::text[]),
      unnest(${sql.array(deduped.map((r) => r.nSuccess))}::int[]),
      unnest(${sql.array(deduped.map((r) => r.total))}::int[])
    on conflict (workflow_run_id, hardware)
    do update set n_success = excluded.n_success, total = excluded.total
    returning (xmax = 0) as inserted
  `;

  const newCount = result.filter((r) => r.inserted).length;
  return { newCount, dupCount: deduped.length - newCount };
}

/**
 * Bulk-upsert rows into the `availability` table.
 * Rows are deduplicated within the batch before sending. ON CONFLICT DO NOTHING
 * makes re-runs idempotent.
 */
export async function bulkUpsertAvailability(
  sql: Sql,
  rows: {
    model: string;
    isl: number | null;
    osl: number | null;
    precision: string;
    hardware: string;
    framework: string;
    specMethod: string;
    disagg: boolean;
    benchmarkType: string;
  }[],
  date: string,
): Promise<void> {
  if (rows.length === 0) return;

  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const r of rows) {
    const key = `${r.model}|${r.isl ?? ''}|${r.osl ?? ''}|${r.precision}|${r.hardware}|${r.framework}|${r.specMethod}|${r.disagg}|${r.benchmarkType}|${date}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  await sql`
    insert into availability (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
    select
      unnest(${sql.array(unique.map((r) => r.model))}::text[]),
      unnest(${sql.array(unique.map((r) => r.isl))}::int[]),
      unnest(${sql.array(unique.map((r) => r.osl))}::int[]),
      unnest(${sql.array(unique.map((r) => r.precision))}::text[]),
      unnest(${sql.array(unique.map((r) => r.hardware))}::text[]),
      unnest(${sql.array(unique.map((r) => r.framework))}::text[]),
      unnest(${sql.array(unique.map((r) => r.specMethod))}::text[]),
      unnest(${sql.array(unique.map((r) => r.disagg))}::bool[]),
      unnest(${sql.array(unique.map((r) => r.benchmarkType))}::text[]),
      ${date}::date
    on conflict do nothing
  `;
}
