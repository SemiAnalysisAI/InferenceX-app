/**
 * Backfill `benchmark_results.metrics->kv_cache_pool_tokens` from the captured
 * server logs. The value is parsed from vLLM's authoritative
 * "GPU KV cache size: N tokens" startup line(s), summed across data-parallel
 * engine cores (see {@link kvCachePoolTokensFromServerLog}).
 *
 * The ingest path now derives this inline in `insertServerLog`, but existing
 * rows need this one-time pass. Idempotent: re-running only touches rows that
 * still lack the value (unless --force).
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-kv-pool
 *     [--limit N]   only process the first N candidate server logs
 *     [--force]     recompute even when the value is already set
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import { kvCachePoolTokensFromServerLog } from './etl/server-log-metrics.js';
import { confirmProceed, parseLimitForceFlags, runBackfillMain } from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function main(): Promise<void> {
  console.log('=== backfill-kv-pool ===');
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  // One server log can be linked to several benchmark_results (multiple
  // concurrency points share a server). Group by log id so we parse each log
  // once and fan the value out to all its rows.
  const candidates = flags.force
    ? await sql<{ server_log_id: number }[]>`
        select distinct server_log_id
        from benchmark_results
        where server_log_id is not null
        order by server_log_id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `
    : await sql<{ server_log_id: number }[]>`
        select distinct server_log_id
        from benchmark_results
        where server_log_id is not null
          and metrics->>'kv_cache_pool_tokens' is null
        order by server_log_id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;

  if (candidates.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return;
  }

  if (!(await confirmProceed(`${candidates.length} candidate server log(s).`))) return;

  let updated = 0;
  let logsWithValue = 0;
  let logsNoValue = 0;
  let failed = 0;
  const t0 = Date.now();
  for (const { server_log_id: logId } of candidates) {
    try {
      const [row] = await sql<{ server_log: string | null }[]>`
        select server_log from server_logs where id = ${logId}
      `;
      const tokens = kvCachePoolTokensFromServerLog(row?.server_log ?? null);
      if (tokens === null) {
        logsNoValue++;
        continue; // non-vLLM or no startup line — leave unset
      }
      logsWithValue++;
      const targets = flags.force
        ? sql`server_log_id = ${logId}`
        : sql`server_log_id = ${logId} and metrics->>'kv_cache_pool_tokens' is null`;
      const result = await sql`
        update benchmark_results
        set metrics = jsonb_set(metrics, '{kv_cache_pool_tokens}', to_jsonb(${tokens}::bigint))
        where ${targets}
      `;
      updated += result.count;
      console.log(`  ✓ log=${logId}: ${tokens.toLocaleString()} tok → ${result.count} row(s)`);
    } catch (error) {
      failed++;
      console.error(`  ✗ log=${logId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(
    `\n=== backfill complete: ${updated} row(s) updated from ${logsWithValue} log(s) ` +
      `(${logsNoValue} log(s) had no KV-pool line, ${failed} failed) in ${totalSec}s ===`,
  );
  if (failed > 0) process.exitCode = 1;
}

runBackfillMain('backfill-kv-pool', sql, main);
