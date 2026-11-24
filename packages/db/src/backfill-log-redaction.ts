/**
 * Sanitize server-log text stored before ingest did, and runs from repositories
 * that are not public.
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
import { backfillLogRedaction } from './lib/stored-redaction.js';

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
  const result = await backfillLogRedaction(sql, { runId, write, concurrency });
  console.log(
    `${result.changed} of ${result.files} file(s) ${write ? 'sanitized' : 'would change'}, ` +
      `${result.blockBacked} of them block-backed${write ? ' (blocks rebuilt)' : ''}, ` +
      `${result.failed} failed`,
  );
  if (result.runUrls === null) {
    console.error('Run URLs left unchanged because a file failed; rerun after fixing it');
    process.exitCode = 1;
  } else {
    console.log(`${result.runUrls} run URL(s) ${write ? 'sanitized' : 'would change'}`);
  }
  if (write) {
    console.log(
      'Purge cached log responses now: bun run admin:cache:invalidate -- <app-url> --immediate',
    );
  }
}

runBackfillMain('backfill-log-redaction', sql, main);
