/**
 * Sanitize server-log text stored before ingest did, with the same rules.
 *
 * Dry run by default: it reads every file in scope and reports how many would
 * change. `--write` rewrites them. A log file is one transaction that replaces
 * the text column and rebuilds its blocks, if any, so block offsets, sizes and
 * bloom filters match the stored text. Sanitized text is a fixed point, so an
 * interrupted run resumes by rerunning.
 *
 * After a write, purge the server-log CDN tag with an immediate invalidation:
 *   bun run admin:cache:invalidate -- <app-url> --immediate
 *
 * Usage:
 *   bun run admin:db:backfill-log-redaction
 *   bun run admin:db:backfill-log-redaction --run-id 12345678901 --write
 *   bun run admin:db:backfill-log-redaction --concurrency 4 --write
 */
import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';
import { redactStoredServerLogFile, type StoredServerLogFile } from './lib/stored-redaction.js';

const runId = parseRunIdFlag();
const write = process.argv.includes('--write');
const concurrencyIndex = process.argv.indexOf('--concurrency');
const concurrency = concurrencyIndex === -1 ? 1 : Number(process.argv[concurrencyIndex + 1]);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  throw new Error('--concurrency requires a positive integer');
}

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: concurrency, onnotice: () => {} });

async function main(): Promise<void> {
  console.log(
    `=== backfill-log-redaction (${write ? 'write' : 'dry run, pass --write to apply'}) ===`,
  );
  console.log(`  run_id = ${runId ?? 'all'}, concurrency = ${concurrency}`);
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
  `;
  console.log(`Scanning ${files.length} server-log file(s)`);
  let changed = 0;
  let blockBacked = 0;
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < files.length) {
        const { log_id, file_name, is_primary } = files[next++]!;
        const file: StoredServerLogFile = {
          logId: log_id,
          fileName: file_name,
          primary: is_primary,
        };
        try {
          const result = await sql.begin((tx) => redactStoredServerLogFile(tx, file, write));
          if (!result.changed) continue;
          changed++;
          if (result.blockBacked) blockBacked++;
          console.log(`  ${log_id} ${file_name}: ${write ? 'sanitized' : 'would change'}`);
        } catch (error) {
          failed++;
          console.error(`  ✗ ${log_id} ${file_name}: ${String(error)}`);
        }
      }
    }),
  );
  console.log(
    `${changed} of ${files.length} file(s) ${write ? 'sanitized' : 'would change'}, ` +
      `${blockBacked} of them block-backed${write ? ' (blocks rebuilt)' : ''}, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
  if (write) {
    console.log(
      'Purge cached log responses now: bun run admin:cache:invalidate -- <app-url> --immediate',
    );
  }
}

runBackfillMain('backfill-log-redaction', sql, main);
