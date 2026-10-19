import { readTraceProfileChunks } from './lib/trace-profile-storage';

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
