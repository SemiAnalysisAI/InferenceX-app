/**
 * Copy benchmark runs the public InferenceX database has and a downstream
 * deployment's database lacks, so downstream submissions are compared against
 * current public results.
 *
 * Insert-only: rows already in the target are never updated or deleted, and
 * target-only runs (downstream submissions) are left untouched. Every query
 * against the source is a SELECT. Rows match on natural keys because serial ids
 * differ between the databases. A run is synced when it is absent from the
 * target or when the target holds fewer child rows for it; within such a run
 * only the missing rows are inserted, and a matched benchmark row gains its
 * server log, log files, or trace replay when the target lacks them.
 * `datasets` and `dataset_conversations` are synced in full; `availability` is
 * synced in full only when every run synced and neither `--limit` nor
 * `--run-id` was passed. Values already in the target are not refreshed, so
 * public backfills of existing rows (e.g. recomputed `aggregate_stats`) do not
 * propagate. Source columns the target schema lacks (newer public migrations)
 * are skipped and reported.
 *
 * Each run commits in its own transaction, so an interrupted sync resumes by
 * rerunning the command.
 *
 * Env:
 *   PUBLIC_DATABASE_READONLY_URL  public InferenceX database (source, read-only)
 *   DATABASE_WRITE_URL            downstream database (target)
 *
 * Usage:
 *   bun run --cwd packages/db db:sync-public --dry-run
 *   bun run --cwd packages/db db:sync-public --yes
 *   bun run --cwd packages/db db:sync-public --run-id 12345678901,12345678902#2 --yes
 *   bun run --cwd packages/db db:sync-public --limit 5 --yes
 *   bun run --cwd packages/db db:sync-public --max-value-bytes 25000000 --yes
 */

import type postgres from 'postgres';

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql, refreshLatestBenchmarks, type Sql } from './etl/db-utils.js';
import { confirmProceed, parseLimitForceFlags, runBackfillMain } from './lib/backfill-runner.js';
import {
  configKey,
  findDriftedRuns,
  naturalKey,
  parseRunSelectors,
  planRunSync,
  RUN_SUMMARY_COUNTS,
  runKey,
  selectRuns,
  type RunSelector,
  type RunSummary,
  type RunSyncPlan,
} from './lib/public-db-sync.js';

type Row = Record<string, postgres.ParameterOrJSON<never>>;
type Db = Sql | postgres.TransactionSql;

const SYNCED_TABLES = [
  'configs',
  'workflow_runs',
  'server_logs',
  'server_log_files',
  'agentic_trace_replay',
  'agentic_trace_profile_chunks',
  'benchmark_results',
  'eval_results',
  'eval_samples',
  'run_stats',
  'changelog_entries',
  'run_datasets',
  'availability',
  'datasets',
  'dataset_conversations',
] as const;
type Table = (typeof SYNCED_TABLES)[number];

const BENCHMARK_NATURAL_KEY = [
  'config_id',
  'benchmark_type',
  'isl',
  'osl',
  'conc',
  'offload_mode',
  'recipe_fingerprint',
] as const;
const EVAL_NATURAL_KEY = ['config_id', 'task', 'isl', 'osl', 'conc'] as const;

/** Postgres caps a statement at 65535 bind parameters. */
const MAX_BIND_PARAMS = 60_000;
const MAX_BATCH_ROWS = 1000;

/**
 * Pass json/jsonb, dates, timestamps, numerics, and arrays through as their
 * Postgres text form. Re-inserting the text verbatim avoids JSON re-encoding,
 * timezone shifts, numeric precision loss, and postgres.js serializing a
 * jsonb array as a Postgres array.
 */
const PASSTHROUGH_TYPES = {
  passthrough: {
    to: 25,
    from: [114, 3802, 1082, 1114, 1184, 1700, 1005, 1007, 1009, 1016, 1015, 199, 3807],
    serialize: (value: string) => value,
    parse: (value: string) => value,
  },
};

const { limit } = parseLimitForceFlags();
const dryRun = process.argv.includes('--dry-run');
const runIdIndex = process.argv.indexOf('--run-id');
let runSelectors: RunSelector[] | null = null;
if (runIdIndex !== -1) {
  try {
    runSelectors = parseRunSelectors(process.argv[runIdIndex + 1] ?? '');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
/**
 * Skip server logs, log files, and trace-replay payloads larger than this many
 * bytes. A small target compute cannot hold, or parse as jsonb, a single
 * value of tens to hundreds of MB. Skipped `aggregate_stats`, `chart_series`,
 * and `request_timeline` are derived and can be rebuilt with the matching
 * `db:backfill-*` script.
 */
const maxValueBytesArg = process.argv[process.argv.indexOf('--max-value-bytes') + 1];
const maxValueBytes = process.argv.includes('--max-value-bytes') ? Number(maxValueBytesArg) : null;
if (maxValueBytes !== null && !(maxValueBytes > 0)) {
  console.error('--max-value-bytes requires a positive byte count');
  process.exit(1);
}
const skippedValues: Record<string, number> = {};
const source = createAdminSql({
  envVar: 'PUBLIC_DATABASE_READONLY_URL',
  max: 2,
  types: PASSTHROUGH_TYPES,
  onnotice: () => {},
});
const target = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  types: PASSTHROUGH_TYPES,
  onnotice: () => {},
});

/** Copyable columns per table: present in both schemas, excluding an `id` the target generates. */
let columns = {} as Record<Table, string[]>;
const inserted: Record<string, number> = {};

/** Columns per table, plus the tables whose `id` the database generates (serial or identity). */
async function readColumns(
  sql: Sql,
): Promise<{ byTable: Map<string, string[]>; generatedIds: Set<string> }> {
  const rows = await sql<
    {
      table_name: string;
      column_name: string;
      column_default: string | null;
      is_identity: string;
    }[]
  >`
    select table_name, column_name, column_default, is_identity
    from information_schema.columns
    where table_schema = 'public' and table_name in ${sql(SYNCED_TABLES)}
    order by table_name, ordinal_position
  `;
  const byTable = new Map<string, string[]>();
  const generatedIds = new Set<string>();
  for (const row of rows) {
    const list = byTable.get(row.table_name) ?? [];
    list.push(row.column_name);
    byTable.set(row.table_name, list);
    if (row.column_name === 'id' && (row.column_default !== null || row.is_identity === 'YES')) {
      generatedIds.add(row.table_name);
    }
  }
  return { byTable, generatedIds };
}

async function resolveColumns(): Promise<void> {
  const [sourceColumns, { byTable: targetColumns, generatedIds }] = await Promise.all([
    readColumns(source).then((result) => result.byTable),
    readColumns(target),
  ]);
  columns = {} as Record<Table, string[]>;
  for (const table of SYNCED_TABLES) {
    const sourceList = sourceColumns.get(table);
    const targetList = targetColumns.get(table);
    if (!sourceList || !targetList) {
      throw new Error(`table ${table} is missing from the ${sourceList ? 'target' : 'source'}`);
    }
    const targetSet = new Set(targetList);
    const skipped = sourceList.filter((column) => !targetSet.has(column));
    if (skipped.length > 0) {
      console.log(`  ! ${table}: target schema lacks ${skipped.join(', ')} (not copied)`);
    }
    // Serial ids differ between databases; natural-key ids (e.g. datasets.id) are copied.
    const generated = generatedIds.has(table);
    columns[table] = sourceList.filter(
      (column) => targetSet.has(column) && !(generated && column === 'id'),
    );
  }
}

function pick(row: Row, cols: readonly string[], overrides: Row = {}): Row {
  const out: Row = {};
  for (const column of cols) out[column] = column in overrides ? overrides[column] : row[column];
  return out;
}

/** Batched `insert … on conflict do nothing`; returns the number of rows written. */
async function insertRows(db: Db, table: Table, rows: readonly Row[]): Promise<number> {
  const cols = columns[table];
  const batchSize = Math.max(
    1,
    Math.min(MAX_BATCH_ROWS, Math.floor(MAX_BIND_PARAMS / cols.length)),
  );
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map((row) => pick(row, cols));
    const result = await db`insert into ${db(table)} ${db(batch, cols)} on conflict do nothing`;
    written += result.count;
  }
  inserted[table] = (inserted[table] ?? 0) + written;
  return written;
}

/** Insert one row that must be new and return its target id. */
async function insertReturningId(db: Db, table: Table, row: Row): Promise<string> {
  const cols = columns[table];
  const [created] = await db<{ id: string }[]>`
    insert into ${db(table)} ${db(pick(row, cols), cols)} returning id::text
  `;
  inserted[table] = (inserted[table] ?? 0) + 1;
  return created!.id;
}

async function syncConfigs(): Promise<{ ids: Map<string, string>; missing: number }> {
  const cols = columns.configs;
  const readAll = (db: Sql) => db<Row[]>`select id::text, ${db(cols)} from configs`;
  const sourceConfigs = await readAll(source);
  let targetConfigs = await readAll(target);
  const known = new Set(targetConfigs.map(configKey));
  const missing = sourceConfigs.filter((config) => !known.has(configKey(config)));
  if (!dryRun && missing.length > 0) {
    await insertRows(target, 'configs', missing);
    targetConfigs = await readAll(target);
  }
  const targetIdByKey = new Map(targetConfigs.map((config) => [configKey(config), config.id]));
  const ids = new Map<string, string>();
  for (const config of sourceConfigs) {
    const id = targetIdByKey.get(configKey(config));
    if (id !== undefined) ids.set(String(config.id), String(id));
  }
  return { ids, missing: missing.length };
}

function readRunSummaries(db: Sql): Promise<RunSummary[]> {
  return db<RunSummary[]>`
    select
      wr.github_run_id::text as github_run_id,
      wr.run_attempt,
      (select count(*)::int from benchmark_results b where b.workflow_run_id = wr.id)
        as benchmark_results,
      (select count(*)::int from benchmark_results b
        where b.workflow_run_id = wr.id and b.server_log_id is not null) as server_logs,
      (select count(*)::int from benchmark_results b
        join server_log_files f on f.server_log_id = b.server_log_id
        where b.workflow_run_id = wr.id) as server_log_files,
      (select count(*)::int from benchmark_results b
        where b.workflow_run_id = wr.id and b.trace_replay_id is not null) as trace_replays,
      (select coalesce(sum(num_nonnulls(${db(TRACE_REPLAY_PAYLOADS.map((column) => `a.${column}`))})), 0)::int
        from benchmark_results b join agentic_trace_replay a on a.id = b.trace_replay_id
        where b.workflow_run_id = wr.id) as trace_payloads,
      (select count(*)::int from eval_results e where e.workflow_run_id = wr.id) as eval_results,
      (select count(*)::int from eval_results e
        join eval_samples s on s.eval_result_id = e.id
        where e.workflow_run_id = wr.id) as eval_samples,
      (select count(*)::int from run_stats r where r.workflow_run_id = wr.id) as run_stats,
      (select count(*)::int from changelog_entries c where c.workflow_run_id = wr.id)
        as changelog_entries,
      (select count(*)::int from run_datasets d where d.workflow_run_id = wr.id) as run_datasets
    from workflow_runs wr
    order by wr.created_at, wr.id
  `;
}

/**
 * Copy a server log and its files once per run; shared logs stay shared.
 * Returns null when the log exceeds `--max-log-bytes`.
 */
async function copyServerLog(
  db: Db,
  sourceLogId: string,
  logIds: Map<string, string>,
): Promise<string | null> {
  const known = logIds.get(sourceLogId);
  if (known) return known;
  if (maxValueBytes !== null) {
    const [size] = await source<{ bytes: string }[]>`
      select octet_length(server_log)::text as bytes from server_logs where id = ${sourceLogId}
    `;
    if (size && Number(size.bytes) > maxValueBytes) {
      skippedValues.server_logs = (skippedValues.server_logs ?? 0) + 1;
      return null;
    }
  }
  const [log] = await source<Row[]>`
    select ${source(columns.server_logs)} from server_logs where id = ${sourceLogId}
  `;
  if (!log) throw new Error(`source server_logs row ${sourceLogId} vanished`);
  const id = await insertReturningId(db, 'server_logs', log);
  logIds.set(sourceLogId, id);
  await copyServerLogFiles(db, sourceLogId, id);
  return id;
}

async function copyServerLogFiles(db: Db, sourceLogId: string, targetLogId: string): Promise<void> {
  const present = await db<{ file_name: string }[]>`
    select file_name from server_log_files where server_log_id = ${targetLogId}
  `;
  const presentNames = new Set(present.map((file) => file.file_name));
  const files = await source<{ file_name: string; bytes: string }[]>`
    select file_name, octet_length(log_text)::text as bytes
    from server_log_files where server_log_id = ${sourceLogId}
  `;
  for (const { file_name, bytes } of files) {
    if (presentNames.has(file_name)) continue;
    if (maxValueBytes !== null && Number(bytes) > maxValueBytes) {
      skippedValues.server_log_files = (skippedValues.server_log_files ?? 0) + 1;
      continue;
    }
    // One file at a time: bundles can hold hundreds of MB of log text.
    const rows = await source<Row[]>`
      select ${source(columns.server_log_files)} from server_log_files
      where server_log_id = ${sourceLogId} and file_name = ${file_name}
    `;
    await insertRows(
      db,
      'server_log_files',
      rows.map((row) => ({ ...row, server_log_id: targetLogId })),
    );
  }
}

/**
 * Nullable payload columns written one statement each: a whole replay row can
 * exceed 1 GB, and bytea travels hex-encoded, which exhausts a small target
 * compute when sent in a single INSERT.
 */
const TRACE_REPLAY_PAYLOADS = [
  'profile_export_jsonl_gz',
  'server_metrics_csv',
  'server_metrics_json_gz',
  'request_timeline_gz',
  'aggregate_stats',
  'chart_series',
  'request_timeline',
];
/**
 * Bytea payloads are moved in bounded slices: a several-hundred-MB value
 * cannot be emitted whole because its hex text form passes Postgres's 1 GB
 * allocation limit.
 */
const BINARY_PAYLOADS: Record<string, true> = {
  profile_export_jsonl_gz: true,
  server_metrics_csv: true,
  server_metrics_json_gz: true,
  request_timeline_gz: true,
};
/** Matches `TRACE_REPLAY_UPLOAD_CHUNK_BYTES` and the 018 chunk-table check. */
const PAYLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

async function copyBinaryPayload(
  db: Db,
  column: string,
  sourceId: string,
  targetId: string,
  bytes: number,
): Promise<void> {
  await db`
    create temporary table if not exists sync_payload_parts (
      part integer primary key,
      data bytea not null
    ) on commit drop
  `;
  await db`delete from pg_temp.sync_payload_parts`;
  for (let part = 0; part * PAYLOAD_CHUNK_BYTES < bytes; part += 1) {
    const [slice] = await source<{ data: Buffer }[]>`
      select substring(${source(column)} from ${part * PAYLOAD_CHUNK_BYTES + 1}::integer
        for ${PAYLOAD_CHUNK_BYTES}::integer) as data
      from agentic_trace_replay where id = ${sourceId}
    `;
    await db`insert into pg_temp.sync_payload_parts (part, data) values (${part}, ${slice!.data})`;
  }
  // Assemble server-side in one pass; appending per chunk would rewrite the value each time.
  await db`
    update agentic_trace_replay set ${db(column)} = (
      select coalesce(string_agg(data, ''::bytea order by part), ''::bytea)
      from pg_temp.sync_payload_parts
    )
    where id = ${targetId}
  `;
}

async function copyProfileChunks(db: Db, sourceId: string, targetId: string): Promise<void> {
  const parts = await source<{ part: number }[]>`
    select part from agentic_trace_profile_chunks where trace_replay_id = ${sourceId} order by part
  `;
  for (const { part } of parts) {
    const rows = await source<Row[]>`
      select ${source(columns.agentic_trace_profile_chunks)} from agentic_trace_profile_chunks
      where trace_replay_id = ${sourceId} and part = ${part}
    `;
    await insertRows(
      db,
      'agentic_trace_profile_chunks',
      rows.map((row) => ({ ...row, trace_replay_id: targetId })),
    );
  }
}

async function payloadBytes(column: string, sourceId: string): Promise<number | null> {
  // Never cast bytea to text to size it: that hex-expands the value past 1 GB.
  const [size] = BINARY_PAYLOADS[column]
    ? await source<{ bytes: string | null }[]>`
        select octet_length(${source(column)})::text as bytes
        from agentic_trace_replay where id = ${sourceId}
      `
    : await source<{ bytes: string | null }[]>`
        select octet_length(${source(column)}::text)::text as bytes
        from agentic_trace_replay where id = ${sourceId}
      `;
  return size?.bytes === null || size?.bytes === undefined ? null : Number(size.bytes);
}

async function copyTraceReplay(db: Db, sourceId: string): Promise<string> {
  const payloads = TRACE_REPLAY_PAYLOADS.filter((column) =>
    columns.agentic_trace_replay.includes(column),
  );
  const scalars = columns.agentic_trace_replay.filter((column) => !payloads.includes(column));
  // Read payloads one column at a time: even the source cannot emit a whole oversized row.
  const [replay] = await source<Row[]>`
    select ${source(scalars)} from agentic_trace_replay where id = ${sourceId}
  `;
  if (!replay) throw new Error(`source agentic_trace_replay row ${sourceId} vanished`);
  const id = await insertReturningId(db, 'agentic_trace_replay', {
    ...replay,
    ...Object.fromEntries(payloads.map((column) => [column, null])),
  });
  // Chunked raw profiles (018): chunk_count and sha256 were copied as scalars,
  // so the parts must follow or profile reads fail their integrity checks.
  await copyProfileChunks(db, sourceId, id);
  await copyTraceReplayPayloads(db, sourceId, id, payloads);
  return id;
}

async function copyTraceReplayPayloads(
  db: Db,
  sourceId: string,
  targetId: string,
  payloads: readonly string[],
): Promise<void> {
  for (const column of payloads) {
    const bytes = await payloadBytes(column, sourceId);
    if (bytes === null) continue;
    if (maxValueBytes !== null && bytes > maxValueBytes) {
      skippedValues[column] = (skippedValues[column] ?? 0) + 1;
      continue;
    }
    if (BINARY_PAYLOADS[column]) {
      await copyBinaryPayload(db, column, sourceId, targetId, bytes);
      continue;
    }
    const [payload] = await source<Row[]>`
      select ${source(column)} from agentic_trace_replay where id = ${sourceId}
    `;
    await db`update agentic_trace_replay set ${db(payload!, column)} where id = ${targetId}`;
  }
}

/**
 * Fill payload columns an earlier capped sync left null on an existing replay.
 * Values already present in the target are never overwritten.
 */
async function fillTraceReplayPayloads(db: Db, sourceId: string, targetId: string): Promise<void> {
  const payloads = TRACE_REPLAY_PAYLOADS.filter((column) =>
    columns.agentic_trace_replay.includes(column),
  );
  const [nulls] = await db<Record<string, boolean>[]>`
    select ${db.unsafe(payloads.map((column) => `${column} is null as "${column}"`).join(', '))}
    from agentic_trace_replay where id = ${targetId}
  `;
  const empty = payloads.filter((column) => nulls?.[column]);
  if (empty.length === 0) return;
  await copyTraceReplayPayloads(db, sourceId, targetId, empty);
  const [after] = await db<{ filled: number }[]>`
    select ${empty.length}::int - num_nulls(${db(empty)}) as filled
    from agentic_trace_replay where id = ${targetId}
  `;
  inserted['payloads filled'] = (inserted['payloads filled'] ?? 0) + Number(after?.filled ?? 0);
}

async function copyEvalSamples(db: Db, sourceEvalId: string, targetEvalId: string): Promise<void> {
  const cursor = source<Row[]>`
    select ${source(columns.eval_samples)} from eval_samples
    where eval_result_id = ${sourceEvalId} order by id
  `.cursor(MAX_BATCH_ROWS);
  for await (const rows of cursor) {
    await insertRows(
      db,
      'eval_samples',
      rows.map((row) => ({ ...row, eval_result_id: targetEvalId })),
    );
  }
}

interface TargetBenchmark {
  id: string;
  server_log_id: string | null;
  trace_replay_id: string | null;
}

async function syncBenchmarks(
  db: Db,
  plan: RunSyncPlan,
  sourceRunId: string,
  targetRunId: string,
  configIds: Map<string, string>,
): Promise<void> {
  const sourceRows = await source<Row[]>`
    select id::text, ${source(columns.benchmark_results)} from benchmark_results
    where workflow_run_id = ${sourceRunId} order by id
  `;
  const targetRows = await db<Row[]>`
    select id::text, server_log_id::text, trace_replay_id::text, ${db(BENCHMARK_NATURAL_KEY)}
    from benchmark_results where workflow_run_id = ${targetRunId}
  `;
  const keyOf = (row: Row, configId: unknown) =>
    naturalKey(BENCHMARK_NATURAL_KEY.map((c) => (c === 'config_id' ? String(configId) : row[c])));
  const targetByKey = new Map<string, TargetBenchmark>(
    targetRows.map((row) => [keyOf(row, row.config_id), row as unknown as TargetBenchmark]),
  );

  const matches: [Row, TargetBenchmark][] = [];
  const additions: [Row, string][] = [];
  for (const row of sourceRows) {
    const configId = configIds.get(String(row.config_id));
    if (configId === undefined) throw new Error(`config ${String(row.config_id)} was not synced`);
    const existing = targetByKey.get(keyOf(row, configId));
    if (existing) matches.push([row, existing]);
    else additions.push([row, configId]);
  }

  // Seed the log and replay maps from matched rows so new rows reuse what the target holds.
  const logIds = new Map<string, string>();
  const replayIds = new Map<string, string>();
  for (const [row, existing] of matches) {
    if (row.server_log_id !== null && existing.server_log_id !== null) {
      logIds.set(String(row.server_log_id), existing.server_log_id);
    }
    if (row.trace_replay_id !== null && existing.trace_replay_id !== null) {
      replayIds.set(String(row.trace_replay_id), existing.trace_replay_id);
    }
  }
  // One replay row can back several points; copy and fill each one once.
  const replayFor = async (sourceReplayId: string): Promise<string> => {
    const known = replayIds.get(sourceReplayId);
    if (known) return known;
    const id = await copyTraceReplay(db, sourceReplayId);
    replayIds.set(sourceReplayId, id);
    return id;
  };
  const filledReplays = new Set<string>();

  for (const [row, existing] of matches) {
    if (row.server_log_id !== null) {
      const sourceLogId = String(row.server_log_id);
      if (existing.server_log_id === null) {
        const logId = await copyServerLog(db, sourceLogId, logIds);
        if (logId !== null) {
          await db`update benchmark_results set server_log_id = ${logId} where id = ${existing.id}`;
        }
      } else if (plan.shortTables.includes('server_log_files')) {
        await copyServerLogFiles(db, sourceLogId, existing.server_log_id);
      }
    }
    if (row.trace_replay_id !== null && existing.trace_replay_id === null) {
      const replayId = await replayFor(String(row.trace_replay_id));
      await db`update benchmark_results set trace_replay_id = ${replayId} where id = ${existing.id}`;
    } else if (
      row.trace_replay_id !== null &&
      existing.trace_replay_id !== null &&
      plan.shortTables.includes('trace_payloads') &&
      !filledReplays.has(existing.trace_replay_id)
    ) {
      filledReplays.add(existing.trace_replay_id);
      await fillTraceReplayPayloads(db, String(row.trace_replay_id), existing.trace_replay_id);
    }
  }

  for (const [row, configId] of additions) {
    const serverLogId =
      row.server_log_id === null
        ? null
        : await copyServerLog(db, String(row.server_log_id), logIds);
    const traceReplayId =
      row.trace_replay_id === null ? null : await replayFor(String(row.trace_replay_id));
    await insertReturningId(db, 'benchmark_results', {
      ...row,
      workflow_run_id: targetRunId,
      config_id: configId,
      server_log_id: serverLogId,
      trace_replay_id: traceReplayId,
    });
  }
}

async function syncEvals(
  db: Db,
  plan: RunSyncPlan,
  sourceRunId: string,
  targetRunId: string,
  configIds: Map<string, string>,
): Promise<void> {
  const sourceRows = await source<Row[]>`
    select e.id::text,
      (select count(*)::int from eval_samples s where s.eval_result_id = e.id) as sample_count,
      ${source(columns.eval_results.map((column) => `e.${column}`))}
    from eval_results e where e.workflow_run_id = ${sourceRunId} order by e.id
  `;
  const targetRows = await db<Row[]>`
    select e.id::text, e.config_id, e.task, e.isl, e.osl, e.conc,
      (select count(*)::int from eval_samples s where s.eval_result_id = e.id) as sample_count
    from eval_results e where e.workflow_run_id = ${targetRunId}
  `;
  // Built in code, not `on conflict`: eval_results_unique treats NULL isl/osl/conc as distinct.
  const keyOf = (row: Row, configId: unknown) =>
    naturalKey(EVAL_NATURAL_KEY.map((c) => (c === 'config_id' ? String(configId) : row[c])));
  const targetByKey = new Map(targetRows.map((row) => [keyOf(row, row.config_id), row]));

  for (const row of sourceRows) {
    const configId = configIds.get(String(row.config_id));
    if (configId === undefined) throw new Error(`config ${String(row.config_id)} was not synced`);
    const existing = targetByKey.get(keyOf(row, configId));
    if (!existing) {
      const id = await insertReturningId(db, 'eval_results', {
        ...row,
        workflow_run_id: targetRunId,
        config_id: configId,
      });
      await copyEvalSamples(db, String(row.id), id);
    } else if (
      plan.shortTables.includes('eval_samples') &&
      Number(row.sample_count) > Number(existing.sample_count)
    ) {
      await copyEvalSamples(db, String(row.id), String(existing.id));
    }
  }
}

async function syncRunChildren(
  db: Db,
  table: 'run_stats' | 'changelog_entries' | 'run_datasets',
  sourceRunId: string,
  targetRunId: string,
): Promise<void> {
  const rows = await source<Row[]>`
    select ${source(columns[table])} from ${source(table)} where workflow_run_id = ${sourceRunId}
  `;
  await insertRows(
    db,
    table,
    rows.map((row) => ({ ...row, workflow_run_id: targetRunId })),
  );
}

async function syncRun(plan: RunSyncPlan, configIds: Map<string, string>): Promise<void> {
  const { github_run_id, run_attempt } = plan.summary;
  const [sourceRun] = await source<Row[]>`
    select id::text, ${source(columns.workflow_runs)} from workflow_runs
    where github_run_id = ${github_run_id} and run_attempt = ${run_attempt}
  `;
  if (!sourceRun) throw new Error('source run vanished');
  const sourceRunId = String(sourceRun.id);

  // Restore counters on rollback so the summary reports committed rows only.
  const committed = { ...inserted };
  try {
    await target.begin(async (tx) => {
      await insertRows(tx, 'workflow_runs', [sourceRun]);
      const [targetRun] = await tx<{ id: string }[]>`
        select id::text from workflow_runs
        where github_run_id = ${github_run_id} and run_attempt = ${run_attempt}
      `;
      const targetRunId = targetRun!.id;
      await syncBenchmarks(tx, plan, sourceRunId, targetRunId, configIds);
      await syncEvals(tx, plan, sourceRunId, targetRunId, configIds);
      await syncRunChildren(tx, 'run_stats', sourceRunId, targetRunId);
      await syncRunChildren(tx, 'changelog_entries', sourceRunId, targetRunId);
      await syncRunChildren(tx, 'run_datasets', sourceRunId, targetRunId);
    });
  } catch (error) {
    for (const table of Object.keys(inserted)) inserted[table] = committed[table] ?? 0;
    throw error;
  }
}

/** Rows of `table` whose full column tuple is absent from the target. */
async function missingByValue(table: Table, keyColumns: readonly string[]): Promise<Row[]> {
  const cols = columns[table];
  const [sourceRows, targetRows] = await Promise.all([
    source<Row[]>`select ${source(cols)} from ${source(table)}`,
    target<Row[]>`select ${target(keyColumns)} from ${target(table)}`,
  ]);
  const present = new Set(targetRows.map((row) => naturalKey(keyColumns.map((c) => row[c]))));
  return sourceRows.filter((row) => !present.has(naturalKey(keyColumns.map((c) => row[c]))));
}

/** Insert the availability rows the target's benchmark rows imply for these runs. */
async function insertAvailabilityForRuns(runs: readonly RunSummary[]): Promise<number> {
  if (runs.length === 0) return 0;
  // Array OIDs map to the passthrough string serializer, so bind array literals; both are integers.
  const runIds = `{${runs.map((run) => run.github_run_id).join(',')}}`;
  const attempts = `{${runs.map((run) => run.run_attempt).join(',')}}`;
  const rows = await target<{ inserted: number }[]>`
    insert into availability
      (model, isl, osl, precision, hardware, framework, spec_method, disagg, benchmark_type, date)
    select distinct c.model, b.isl, b.osl, c.precision, c.hardware, c.framework, c.spec_method,
      c.disagg, b.benchmark_type, b.date
    from benchmark_results b
    join configs c on c.id = b.config_id
    join workflow_runs wr on wr.id = b.workflow_run_id
    join unnest(
      ${runIds}::bigint[],
      ${attempts}::smallint[]
    ) as selected(github_run_id, run_attempt)
      on selected.github_run_id = wr.github_run_id and selected.run_attempt = wr.run_attempt
    on conflict do nothing
    returning 1 as inserted
  `;
  return rows.length;
}

async function syncDatasets(): Promise<{ datasets: number; conversations: number }> {
  const missingDatasets = await missingByValue('datasets', ['slug']);
  if (!dryRun) await insertRows(target, 'datasets', missingDatasets);

  const readSlugs = 'select id::text, slug from datasets';
  const [sourceDatasets, targetDatasets] = await Promise.all([
    source.unsafe<{ id: string; slug: string }[]>(readSlugs),
    target.unsafe<{ id: string; slug: string }[]>(readSlugs),
  ]);
  const targetIdBySlug = new Map(targetDatasets.map((d) => [d.slug, d.id]));
  let conversations = 0;
  for (const { id: sourceId, slug } of sourceDatasets) {
    const targetId = targetIdBySlug.get(slug);
    const present = targetId
      ? await target<{ conv_id: string }[]>`
          select conv_id from dataset_conversations where dataset_id = ${targetId}
        `
      : [];
    const presentIds = new Set(present.map((row) => String(row.conv_id)));
    const rows = await source<Row[]>`
      select ${source(columns.dataset_conversations)} from dataset_conversations
      where dataset_id = ${sourceId}
    `;
    const missing = rows.filter((row) => !presentIds.has(String(row.conv_id)));
    conversations += missing.length;
    if (!dryRun && targetId && missing.length > 0) {
      await insertRows(
        target,
        'dataset_conversations',
        missing.map((row) => ({ ...row, dataset_id: targetId })),
      );
    }
  }
  return { datasets: missingDatasets.length, conversations };
}

function describePlan(plan: RunSyncPlan): string {
  const { summary } = plan;
  const detail = plan.missing
    ? `${summary.benchmark_results} benchmarks, ${summary.eval_results} evals`
    : `short: ${plan.shortTables.join(', ')}`;
  return `${runKey(summary)} ${plan.missing ? 'missing' : 'partial'} (${detail})`;
}

async function main(): Promise<void> {
  console.log('=== sync-public-db ===');
  console.log(`  dry run = ${dryRun}`);
  await resolveColumns();

  const [sourceRuns, targetRuns] = await Promise.all([
    readRunSummaries(source),
    readRunSummaries(target),
  ]);
  let plans = planRunSync(sourceRuns, targetRuns);
  let selectedRuns: RunSummary[] | null = null;
  if (runSelectors) {
    const selection = selectRuns(sourceRuns, plans, runSelectors);
    if (selection.unknown.length > 0) {
      const ids = selection.unknown.map(
        (s) => s.githubRunId + (s.runAttempt ? `#${s.runAttempt}` : ''),
      );
      throw new Error(`Not in the source database: ${ids.join(', ')}`);
    }
    for (const key of selection.inSync) console.log(`  ${key} already in sync`);
    plans = selection.plans;
    selectedRuns = selection.runs;
  }
  plans = plans.slice(0, limit ?? undefined);
  const missingRuns = plans.filter((plan) => plan.missing).length;
  console.log(`  source runs = ${sourceRuns.length}, target runs = ${targetRuns.length}`);
  console.log(
    `  runs to sync = ${plans.length} (${missingRuns} missing, ${plans.length - missingRuns} partial)`,
  );
  for (const table of RUN_SUMMARY_COUNTS) {
    const sourceTotal = plans.reduce((sum, plan) => sum + plan.summary[table], 0);
    console.log(`    ${table.padEnd(22)} ≤ ${sourceTotal} source rows`);
  }

  const drift = findDriftedRuns(sourceRuns, targetRuns);
  console.log(`  drifted runs (target has rows public removed) = ${drift.length}`);
  for (const run of drift) console.log(`    ${run.key} ${run.tables.join(', ')}`);

  const missingAvailability = await missingByValue('availability', columns.availability);
  console.log(`  availability rows missing = ${missingAvailability.length}`);

  if (dryRun) {
    const { missing } = await syncConfigs();
    const datasets = await syncDatasets();
    console.log(`  configs missing = ${missing}`);
    console.log(
      `  datasets missing = ${datasets.datasets}, conversations missing = ${datasets.conversations}`,
    );
    for (const plan of plans) console.log(`    ${describePlan(plan)}`);
    return;
  }

  if (!(await confirmProceed(`${plans.length} run(s) will be copied into the target database.`))) {
    return;
  }

  const { ids: configIds, missing } = await syncConfigs();
  console.log(`  configs inserted = ${missing}`);

  let ok = 0;
  let failed = 0;
  const t0 = Date.now();
  for (const plan of plans) {
    const start = Date.now();
    try {
      await syncRun(plan, configIds);
      ok++;
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  ✓ ${describePlan(plan)} (${elapsed}s, ${ok + failed}/${plans.length})`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      // postgres.js attaches the failing statement; its head names the table.
      const query =
        error instanceof Error && 'query' in error && typeof error.query === 'string'
          ? error.query.replaceAll(/\s+/g, ' ').slice(0, 80)
          : null;
      console.error(`  ✗ ${describePlan(plan)}: ${message}${query ? ` [${query}]` : ''}`);
    }
  }

  if (selectedRuns) {
    // Only the selected runs' rows, derived as ingest does; the global table could advertise unsynced dates.
    console.log(`  availability rows inserted = ${await insertAvailabilityForRuns(selectedRuns)}`);
  } else if (limit === null && failed === 0) {
    // Availability is global; with --limit or failed runs it could advertise dates the target lacks.
    await insertRows(target, 'availability', missingAvailability);
  } else {
    console.log('  availability skipped: rerun without --limit once every run syncs');
  }
  await syncDatasets();
  if ((inserted.benchmark_results ?? 0) > 0) await refreshLatestBenchmarks(target);

  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n=== sync complete: ${ok} ok, ${failed} failed in ${totalSec}s ===`);
  for (const [table, rows] of Object.entries(inserted)) {
    console.log(`  ${table.padEnd(22)} +${rows}`);
  }
  for (const [kind, n] of Object.entries(skippedValues)) {
    console.log(`  oversized ${kind} skipped = ${n}`);
  }
  console.log('  Invalidate API cache: bun run admin:cache:invalidate');
  if (failed > 0) process.exitCode = 1;
}

runBackfillMain('sync-public-db', target, () => main().finally(() => source.end()));
