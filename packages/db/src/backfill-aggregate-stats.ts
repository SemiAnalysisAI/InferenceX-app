/**
 * Backfill `agentic_trace_replay.aggregate_stats` for rows that are missing it
 * or were computed by an older `STATS_VERSION`.
 *
 * The ingest path now computes stats inline, but existing rows (and rows
 * whose computation logic has since changed) still need this pass. Run after the agentic schema migration and any time `STATS_VERSION` bumps.
 *
 * Strategy:
 *   - Stream rows one at a time (server_metrics_json_gz can be hundreds of
 *     MB decompressed for TP+EP / high-conc points — keeping one in memory
 *     at a time avoids OOM).
 *   - Skip rows whose stored `aggregate_stats.version` already matches.
 *   - Recompute via the same `computeAggregateStats()` helper the ingest
 *     path uses, so behavior cannot drift.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-aggregate-stats
 *     [--limit N]   only process the first N candidate rows (useful for
 *                   smoke-tests on a fresh deploy)
 *     [--force]     recompute every row, even if version already matches
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import {
  computeAggregateStats,
  mergeProfileStatsUpgrade,
  STATS_VERSION,
  type AggregateStats,
} from './etl/compute-aggregate-stats.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  confirmProceed,
  jsonbParam,
  parseLimitForceFlags,
  runBackfillMain,
  runPerIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function main(): Promise<void> {
  console.log('=== backfill-aggregate-stats ===');
  console.log(`  STATS_VERSION = ${STATS_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  // Find candidates: rows missing stats, or whose stored version is stale.
  // Using >>'version'::int comparison would error on null; coalesce to -1 so
  // null-stats rows always count as stale.
  const candidates = flags.force
    ? await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        order by id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `
    : await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        where aggregate_stats is null
           or coalesce((aggregate_stats->>'version')::int, -1) <> ${STATS_VERSION}
        order by id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;

  if (candidates.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return;
  }

  if (!(await confirmProceed(`${candidates.length} candidate row(s).`))) return;

  await runPerIdBackfill(
    candidates.map((c) => c.id),
    async (id) => {
      // Fetch one row at a time — the json_gz blob is the heavy field.
      const [row] = await sql<
        { profile_export_jsonl_gz: Buffer | null; aggregate_stats: AggregateStats | null }[]
      >`
        select profile_export_jsonl_gz, aggregate_stats
        from agentic_trace_replay
        where id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      let stats: AggregateStats;
      if (row.aggregate_stats?.version === 3) {
        const profileStats = await computeAggregateStats({
          profileBlob: row.profile_export_jsonl_gz,
          serverBlob: null,
        });
        stats = mergeProfileStatsUpgrade(row.aggregate_stats, profileStats);
      } else {
        const [serverRow] = await sql<{ server_metrics_json_gz: Buffer | null }[]>`
          select server_metrics_json_gz
          from agentic_trace_replay
          where id = ${id}
        `;
        stats = await computeAggregateStats({
          profileBlob: row.profile_export_jsonl_gz,
          serverBlob: serverRow?.server_metrics_json_gz ?? null,
        });
      }

      await sql`
        update agentic_trace_replay
        set aggregate_stats = ${jsonbParam(sql, stats)}
        where id = ${id}
      `;
      return 'ok';
    },
  );
}

runBackfillMain('backfill-aggregate-stats', sql, main);
