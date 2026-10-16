import { readTraceProfileChunks } from './lib/trace-profile-storage';
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
 *   bun run --cwd packages/db db:backfill-aggregate-stats
 *     [--limit N]   only process the first N candidate rows (useful for
 *                   smoke-tests on a fresh deploy)
 *     [--force]     recompute every row, even if version already matches
 *     [--run-id N] only process trace rows linked to one GitHub workflow run
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import {
  computeAggregateStats,
  computeProfileAggregateStatsFromCompressedChunks,
  mergeProfileStatsUpgrade,
  STATS_VERSION,
  type AggregateStats,
} from './etl/compute-aggregate-stats.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  jsonbParam,
  parseLimitForceFlags,
  parseRunIdFlag,
  retainPopulatedFields,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

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
  console.log(`  run_id = ${githubRunId ?? 'all'}`);

  await runCandidateIdBackfill(
    async () => {
      const runFilter = githubRunId
        ? sql`
            and exists (
              select 1
              from benchmark_results br
              join workflow_runs wr on wr.id = br.workflow_run_id
              where br.trace_replay_id = agentic_trace_replay.id
                and wr.github_run_id = ${githubRunId}
            )
          `
        : sql``;
      // Find candidates: rows missing stats, or whose stored version is stale.
      // Using >>'version'::int comparison would error on null; coalesce to -1 so
      // null-stats rows always count as stale.
      const candidates = flags.force
        ? await sql<{ id: number }[]>`
            select id
            from agentic_trace_replay
            where mod(id, ${flags.shardCount}) = ${flags.shardIndex} ${runFilter}
            order by id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `
        : await sql<{ id: number }[]>`
            select id
            from agentic_trace_replay
            where (aggregate_stats is null
               or coalesce((aggregate_stats->>'version')::int, -1) < ${STATS_VERSION})
              and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
              ${runFilter}
            order by id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      // Fetch one row at a time — the json_gz blob is the heavy field.
      const [row] = await sql<{ aggregate_stats: AggregateStats | null }[]>`
        select aggregate_stats from agentic_trace_replay where id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const profileStats = await computeProfileAggregateStatsFromCompressedChunks(
        readTraceProfileChunks(sql, id),
      );

      let stats: AggregateStats;
      // Only carry server distributions from versions with the current parser.
      // Earlier bundles need a server reparse to populate ATOM metrics.
      const storedVersion = row.aggregate_stats?.version;
      if (
        !flags.force &&
        storedVersion !== undefined &&
        storedVersion >= 9 &&
        storedVersion < STATS_VERSION
      ) {
        stats = mergeProfileStatsUpgrade(row.aggregate_stats!, profileStats);
      } else {
        const [serverRow] = await sql<{ server_metrics_json_gz: Buffer | null }[]>`
          select server_metrics_json_gz
          from agentic_trace_replay
          where id = ${id}
        `;
        const serverStats = await computeAggregateStats({
          profileBlob: null,
          serverBlob: serverRow?.server_metrics_json_gz ?? null,
        });
        stats = mergeProfileStatsUpgrade(serverStats, profileStats);
      }

      retainPopulatedFields(row.aggregate_stats, stats, [
        'isl',
        'osl',
        'kvCacheUtil',
        'prefixCacheHitRate',
        'e2elPerOsl',
      ]);
      await sql`
        update agentic_trace_replay
        set aggregate_stats = ${jsonbParam(sql, stats)}
        where id = ${id}
          and coalesce((aggregate_stats->>'version')::int, -1) <= ${STATS_VERSION}
      `;
      return 'ok';
    },
  );
}

runBackfillMain('backfill-aggregate-stats', sql, main);
