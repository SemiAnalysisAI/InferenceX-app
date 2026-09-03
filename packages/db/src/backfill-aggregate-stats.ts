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
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

// Neon's HTTP response and JS drivers should not receive a 100+ MB bytea as
// one value. Slice oversized TOAST values into independent bounded reads and
// feed the compressed bytes directly into the streaming gzip parser.
const MAX_INLINE_PROFILE_BYTES = 64 * 1024 * 1024;
const PROFILE_CHUNK_BYTES = 8 * 1024 * 1024;

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function* readProfileChunks(id: number, totalBytes: number): AsyncGenerator<Buffer> {
  for (let offset = 0; offset < totalBytes; offset += PROFILE_CHUNK_BYTES) {
    const length = Math.min(PROFILE_CHUNK_BYTES, totalBytes - offset);
    const [row] = await sql<{ chunk: Buffer }[]>`
      select substring(profile_export_jsonl_gz from ${offset + 1} for ${length}) as chunk
      from agentic_trace_replay
      where id = ${id}
    `;
    if (!row?.chunk) throw new Error(`profile blob chunk missing at byte ${offset}`);
    yield row.chunk;
  }
}

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
              join latest_workflow_runs wr on wr.id = br.workflow_run_id
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
            where true ${runFilter}
            order by id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `
        : await sql<{ id: number }[]>`
            select id
            from agentic_trace_replay
            where (aggregate_stats is null
               or coalesce((aggregate_stats->>'version')::int, -1) <> ${STATS_VERSION})
              ${runFilter}
            order by id
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      // Fetch one row at a time — the json_gz blob is the heavy field.
      const [row] = await sql<
        {
          profile_export_jsonl_gz: Buffer | null;
          profile_blob_bytes: number;
          aggregate_stats: AggregateStats | null;
        }[]
      >`
        select
          case
            when pg_column_size(profile_export_jsonl_gz) <= ${MAX_INLINE_PROFILE_BYTES}
              then profile_export_jsonl_gz
            else null
          end as profile_export_jsonl_gz,
          coalesce(pg_column_size(profile_export_jsonl_gz), 0)::bigint as profile_blob_bytes,
          aggregate_stats
        from agentic_trace_replay
        where id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const profileStats =
        Number(row.profile_blob_bytes) > MAX_INLINE_PROFILE_BYTES
          ? await computeProfileAggregateStatsFromCompressedChunks(
              readProfileChunks(id, Number(row.profile_blob_bytes)),
            )
          : await computeAggregateStats({
              profileBlob: row.profile_export_jsonl_gz,
              serverBlob: null,
            });

      let stats: AggregateStats;
      // Only carry server distributions from versions with the current parser.
      // Earlier bundles need a server reparse to populate ATOM metrics.
      const storedVersion = row.aggregate_stats?.version;
      if (
        !flags.force &&
        storedVersion !== undefined &&
        storedVersion >= 10 &&
        storedVersion < STATS_VERSION
      ) {
        stats = mergeProfileStatsUpgrade(row.aggregate_stats!, profileStats);
      } else {
        const [serverRow] = await sql<
          { server_metrics_json_gz: Buffer | null; framework: string; disagg: boolean }[]
        >`
          select atr.server_metrics_json_gz, c.framework, c.disagg
          from agentic_trace_replay atr
          join benchmark_results br on br.trace_replay_id = atr.id
          join configs c on c.id = br.config_id
          where atr.id = ${id}
          order by br.id limit 1
        `;
        const serverStats = await computeAggregateStats({
          profileBlob: null,
          serverBlob: serverRow?.server_metrics_json_gz ?? null,
          metricsContext: serverRow,
        });
        stats = mergeProfileStatsUpgrade(serverStats, profileStats);
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
