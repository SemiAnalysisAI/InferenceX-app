/**
 * Sanitize values already stored in
 * server logs and trace-replay chart series, with the rules ingest applies.
 *
 * Dry run by default: it reads every file and chart series in scope and
 * reports how many would change. `--write` rewrites them. A log file is one
 * transaction that replaces the text column and rebuilds its blocks, if any,
 * so block offsets, sizes and bloom filters match the stored text. Redacted
 * text has nothing left to match, so an interrupted run resumes by rerunning
 * (with a new key, which only affects files not yet written).
 *
 * Raw inputs (`server_metrics_json_gz`, `server_metrics_csv`) are not served by
 * any public route and stay untouched. After a write, purge the server-log CDN
 * tag with an immediate cache invalidation:
 *   bun run admin:cache:invalidate -- <app-url> --immediate
 *
 * Usage:
 *   bun run admin:db:backfill-log-redaction
 *   bun run admin:db:backfill-log-redaction --run-id 12345678901 --write
 *   bun run admin:db:backfill-log-redaction --limit 100 --concurrency 4 --write
 */
import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { processRedactionKey } from './etl/log-redaction.js';
import { parseLimitForceFlags, parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';
import {
  redactStoredChartSeries,
  redactStoredServerLogFile,
  type StoredServerLogFile,
} from './lib/stored-redaction.js';

const { limit } = parseLimitForceFlags();
const runId = parseRunIdFlag();
const write = process.argv.includes('--write');
const concurrencyIndex = process.argv.indexOf('--concurrency');
const concurrency = concurrencyIndex === -1 ? 1 : Number(process.argv[concurrencyIndex + 1]);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  throw new Error('--concurrency requires a positive integer');
}

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: concurrency, onnotice: () => {} });

async function eachConcurrently<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) await run(items[next++]!);
    }),
  );
}

async function redactServerLogs(): Promise<void> {
  const files = await sql<{ log_id: string; file_name: string; is_primary: boolean }[]>`
    with scoped as (
      select s.id, s.file_name from server_logs s
      where ${runId ?? null}::bigint is null or exists (
        select 1 from benchmark_results br
        join workflow_runs wr on wr.id = br.workflow_run_id
        where br.server_log_id = s.id and wr.github_run_id = ${runId ?? null}::bigint)
    )
    select log_id, file_name, is_primary from (
      select id::text as log_id, file_name, true as is_primary, id from scoped
      union all
      select f.server_log_id::text, f.file_name, false, f.server_log_id
      from server_log_files f join scoped on scoped.id = f.server_log_id
    ) files
    order by id desc, is_primary desc, file_name
    ${limit ? sql`limit ${limit}` : sql``}
  `;
  console.log(`Scanning ${files.length} server-log file(s)`);
  let changed = 0;
  let blockBacked = 0;
  let failed = 0;
  await eachConcurrently(files, async ({ log_id, file_name, is_primary }) => {
    const file: StoredServerLogFile = { logId: log_id, fileName: file_name, primary: is_primary };
    try {
      const result = await sql.begin((tx) =>
        redactStoredServerLogFile(tx, file, processRedactionKey, write),
      );
      if (!result.changed) return;
      changed++;
      if (result.blockBacked) blockBacked++;
      console.log(`  ${log_id} ${file_name}: ${write ? 'redacted' : 'would redact'}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ ${log_id} ${file_name}: ${String(error)}`);
    }
  });
  console.log(
    `Server logs: ${changed} of ${files.length} file(s) ${write ? 'redacted' : 'would change'}, ` +
      `${blockBacked} of them block-backed${write ? ' (blocks rebuilt)' : ''}, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
}

async function redactChartSeries(): Promise<void> {
  const runFilter = runId
    ? sql`and exists (
        select 1 from benchmark_results br
        join workflow_runs wr on wr.id = br.workflow_run_id
        where br.trace_replay_id = atr.id and wr.github_run_id = ${runId})`
    : sql``;
  const rows = await sql<{ id: string }[]>`
    select atr.id::text from agentic_trace_replay atr
    where (atr.chart_series is not null or atr.chart_series_summary_gz is not null) ${runFilter}
    order by atr.id desc
    ${limit ? sql`limit ${limit}` : sql``}
  `;
  console.log(`Scanning ${rows.length} trace replay(s)`);
  let series = 0;
  let summaries = 0;
  let failed = 0;
  await eachConcurrently(rows, async ({ id }) => {
    try {
      const result = await redactStoredChartSeries(sql, id, processRedactionKey, write);
      if (result.series) series++;
      if (result.summary) summaries++;
      if (result.series || result.summary) {
        console.log(`  trace_replay ${id}: ${write ? 'redacted' : 'would redact'}`);
      }
    } catch (error) {
      failed++;
      console.error(`  ✗ trace_replay ${id}: ${String(error)}`);
    }
  });
  console.log(
    `Chart series: ${series} chart_series and ${summaries} chart_series_summary_gz of ` +
      `${rows.length} trace replay(s) ${write ? 'redacted' : 'would change'}, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log(
    `=== backfill-log-redaction (${write ? 'write' : 'dry run, pass --write to apply'}) ===`,
  );
  console.log(
    `  run_id = ${runId ?? 'all'}, limit = ${limit ?? 'none'}, concurrency = ${concurrency}`,
  );
  await redactServerLogs();
  await redactChartSeries();
  if (write) {
    console.log(
      'Purge cached log responses now: bun run admin:cache:invalidate -- <app-url> --immediate',
    );
  }
}

runBackfillMain('backfill-log-redaction', sql, main);
