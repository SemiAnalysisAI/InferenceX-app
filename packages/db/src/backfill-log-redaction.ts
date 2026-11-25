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
 * Before clearing the URL of a private-repository run, it appends `github_run_id`,
 * `run_attempt` and `html_url` to an operator-only JSONL file (`--url-map <path>`,
 * default under `~/.inferencex/redacted-run-urls/`) and prints only its path. Keep that
 * file out of git and CI logs: it is the only record of those runs' repositories.
 *
 * `--downstream` is for a downstream deployment's own database: it applies the shared
 * rules but keeps that deployment's private repository names and run URLs.
 *
 * After a write, purge the server-log CDN tag with an immediate invalidation:
 *   bun run admin:cache:invalidate -- <app-url> --immediate
 *
 * Usage:
 *   bun run admin:db:backfill-log-redaction
 *   bun run admin:db:backfill-log-redaction --run-id 12345678901 --write
 *   bun run admin:db:backfill-log-redaction --concurrency 4 --write
 *   bun run admin:db:backfill-log-redaction --downstream --write
 */
import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';
import { redactedRunUrlsPath } from './lib/redacted-run-urls.js';
import { backfillLogRedaction, reportLogRedaction } from './lib/stored-redaction.js';

const runId = parseRunIdFlag();
const write = process.argv.includes('--write');
const downstream = process.argv.includes('--downstream');
const urlMapFile = redactedRunUrlsPath();

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
  const scope = downstream ? ', downstream (repository names and run URLs kept)' : '';
  console.log(`  run_id = ${runId ?? 'all'}, concurrency = ${concurrency}${scope}`);
  const options = { runId, write, concurrency, urlMapFile, downstream };
  const result = await backfillLogRedaction(sql, options);
  process.exitCode = reportLogRedaction(result, options);
}

runBackfillMain('backfill-log-redaction', sql, main);
