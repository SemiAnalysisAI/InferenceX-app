import path from 'node:path';

import type postgres from 'postgres';
import {
  readCappedServerLogFile,
  type ServerLogFile,
  type ServerLogFilePath,
} from './server-log-artifacts';
import type { BenchmarkType, PowerAudit, WorkerPower } from './benchmark-mapper';
import { kvCachePoolTokensFromServerLog } from './server-log-metrics';
import {
  capServerLogText,
  maxServerLogFileBytes,
  type CappedServerLogText,
} from './server-log-limits';

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
  powerInvalidReasons?: string[];
  powerAudit?: PowerAudit;
}

type BenchmarkPointIdentity = Pick<
  BenchmarkPersistenceInput,
  'configId' | 'benchmarkType' | 'isl' | 'osl' | 'conc' | 'offloadMode' | 'recipeFingerprint'
>;

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

export async function bulkIngestBenchmarkRows(
  sql: Sql,
  rows: BenchmarkPersistenceInput[],
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number; insertedIds: number[] }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0, insertedIds: [] };

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
  const workersJsons = deduped.map((r) =>
    r.workers === undefined ? null : JSON.stringify(r.workers),
  );
  const powerInvalidReasonsJsons = deduped.map((r) =>
    r.powerInvalidReasons === undefined ? null : JSON.stringify(r.powerInvalidReasons),
  );
  const powerAuditJsons = deduped.map((r) =>
    r.powerAudit === undefined ? null : JSON.stringify(r.powerAudit),
  );

  const result = await sql<{ inserted: boolean; id: number }[]>`
    insert into benchmark_results (
      workflow_run_id, config_id, benchmark_type, offload_mode, date,
      isl, osl, conc, image, recipe_fingerprint, metrics, workers,
      power_invalid_reasons, power_audit
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
      unnest(${sql.array(images)}::text[]),
      unnest(${sql.array(recipeFingerprints)}::text[]),
      unnest(${sql.array(metricsJsons)}::jsonb[]),
      unnest(${sql.array(workersJsons)}::jsonb[]),
      unnest(${sql.array(powerInvalidReasonsJsons)}::jsonb[]),
      unnest(${sql.array(powerAuditJsons)}::jsonb[])
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
      workers = excluded.workers,
      -- Like workers, the fresh artifact is authoritative for provenance: a
      -- re-ingest from an artifact without the fields deliberately nulls them.
      power_invalid_reasons = excluded.power_invalid_reasons,
      -- Except AgentX provenance, which no result row carries: it is derived
      -- from the telemetry bundle and attached to the per-job sibling before
      -- insert, so an aggregate copy or a re-ingest without it must not clear it.
      -- A row that does carry one (a future producer) still wins.
      power_audit = case
        when excluded.benchmark_type = 'agentic_traces'
          then coalesce(excluded.power_audit, benchmark_results.power_audit)
        else excluded.power_audit
      end
    returning (xmax = 0) as inserted, id
  `;

  const newCount = result.filter((r) => r.inserted).length;
  return {
    newCount,
    dupCount: deduped.length - newCount,
    insertedIds: result.map((r) => r.id),
  };
}

interface DeferredServerLogFile {
  fileName: string;
  /** Text capped to `maxBytes`; path-backed files never load more than that. */
  readCapped: (maxBytes: number) => CappedServerLogText;
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
  const maxBytes = maxServerLogFileBytes();
  const readStored = (file: DeferredServerLogFile): string => {
    const capped = file.readCapped(maxBytes);
    if (capped.truncated) {
      console.warn(
        `    [WARN] server_logs ${file.fileName}: truncated ${capped.originalBytes} bytes to ` +
          `${capped.storedBytes} (limit ${maxBytes}); full file stays in the artifact`,
      );
    }
    return capped.text;
  };
  const primaryText = readStored(primary);
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
      await tx`
        update server_logs
        set file_name = case
              when file_name = 'server.log' then ${primary.fileName}
              else file_name
            end,
            files_complete = true
        where id = ${logId}
      `;
      const stored = await tx<{ file_name: string }[]>`
        select file_name from server_log_files where server_log_id = ${logId}
      `;
      const storedNames = new Set(stored.map((row) => row.file_name));
      for (const file of additional) {
        if (storedNames.has(file.fileName)) continue;
        const logText = readStored(file);
        await tx`
          insert into server_log_files (server_log_id, file_name, log_text)
          values (${logId}, ${file.fileName}, ${logText})
          on conflict (server_log_id, file_name) do nothing
        `;
      }
    }

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
    files.map((file) => ({
      fileName: file.fileName,
      readCapped: (maxBytes) => capServerLogText(file.logText, maxBytes),
    })),
  );
}

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
      readCapped: (maxBytes) => readCappedServerLogFile(file.path, maxBytes),
    })),
  );
}

export async function insertServerLog(
  sql: Sql,
  benchmarkResultIds: number[],
  serverLog: string,
): Promise<void> {
  await insertServerLogFiles(sql, benchmarkResultIds, [
    { fileName: 'server.log', logText: serverLog },
  ]);
}

export async function bulkIngestRunStats(
  sql: Sql,
  rows: { hardware: string; nSuccess: number; total: number }[],
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0 };

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
