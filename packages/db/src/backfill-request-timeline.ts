import { readTraceProfileChunks } from './lib/trace-profile-storage';
/**
 * Backfill `agentic_trace_replay.request_timeline_gz` (gzip JSON plus the
 * `request_timeline_version` and `request_count` scalars) for rows whose gzip
 * timeline is missing or older than `REQUEST_TIMELINE_VERSION`.
 *
 * A row that still holds a current-version legacy `request_timeline` JSONB is
 * converted without reading its profile blob: its requests stream out of
 * Postgres in index ranges, and the gzip is written only when their count
 * matches `jsonb_array_length`. Every other row is recomputed from the stored
 * `profile_export.jsonl` gzip. A failed row does not stop the run; failures
 * are listed at the end and the process exits nonzero. Run after migration 017
 * and any time the version bumps.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-request-timeline
 *     [--limit N]            only process the first N candidate rows
 *     [--force]              recompute every row from its profile blob, even if current
 *     [--run-id ID]          only rows linked to one GitHub workflow run
 *     [--shard-count N --shard-index I]  only rows whose id falls in this shard
 *     [--drop-legacy-jsonb]  opt-in: after re-reading and verifying a row's stored
 *                            gzip timeline, set its legacy JSONB to null
 *     [--yes]                skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
} from './etl/compute-request-timeline.js';
import { createAdminSql } from './etl/db-utils.js';
import { gzipRequestTimeline } from './etl/request-timeline-codec.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  requireBackfillPayload,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';
import {
  convertLegacyRequestTimeline,
  dropVerifiedLegacyRequestTimeline,
  writeRequestTimelineGz,
  type RequestTimelineGzRow,
} from './lib/request-timeline-backfill.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();
const dropLegacyJsonb = process.argv.includes('--drop-legacy-jsonb');

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function recomputeFromProfile(id: number): Promise<RequestTimelineGzRow> {
  const timeline = requireBackfillPayload(
    await computeRequestTimeline(() => readTraceProfileChunks(sql, id)),
    'request_timeline_gz',
  );
  return {
    gz: await gzipRequestTimeline(timeline),
    version: timeline.version,
    requestCount: timeline.requests.length,
  };
}

interface RowState {
  gz_current: boolean;
  has_legacy: boolean;
  legacy_version: number | null;
}

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  const [row] = await sql<RowState[]>`
    select
      coalesce(
        request_timeline_gz is not null
          and request_timeline_version = ${REQUEST_TIMELINE_VERSION},
        false
      ) as gz_current,
      (request_timeline is not null) as has_legacy,
      (request_timeline->>'version')::int as legacy_version
    from agentic_trace_replay
    where id = ${id}
  `;
  if (!row) {
    console.warn(`  id=${id}: row vanished, skipping`);
    return 'skipped';
  }

  if (flags.force || !row.gz_current) {
    const stored =
      !flags.force && row.legacy_version === REQUEST_TIMELINE_VERSION
        ? await convertLegacyRequestTimeline(sql, id)
        : await recomputeFromProfile(id);
    if (!(await writeRequestTimelineGz(sql, id, stored))) {
      console.warn(`  id=${id}: row vanished or holds a newer timeline version, skipping`);
      return 'skipped';
    }
  }
  if (dropLegacyJsonb && row.has_legacy) await dropVerifiedLegacyRequestTimeline(sql, id);
  return 'ok';
}

async function main(): Promise<void> {
  console.log('=== backfill-request-timeline ===');
  console.log(`  REQUEST_TIMELINE_VERSION = ${REQUEST_TIMELINE_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  drop legacy jsonb = ${dropLegacyJsonb}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  await runCandidateIdBackfill(async () => {
    const runFilter = githubRunId
      ? sql`and exists (
          select 1 from benchmark_results br
          join workflow_runs wr on wr.id = br.workflow_run_id
          where br.trace_replay_id = agentic_trace_replay.id
            and wr.github_run_id = ${githubRunId}
        )`
      : sql``;
    // A row can produce a gzip timeline from its profile blob or, without
    // reading the profile, from a current legacy JSONB timeline. Rows with
    // neither keep no timeline and the API serves them as "no timeline data".
    // With --drop-legacy-jsonb, rows that already have a gzip copy and still
    // hold legacy JSONB are candidates too; each is verified before clearing.
    const candidates = flags.force
      ? await sql<{ id: number }[]>`
          select id
          from agentic_trace_replay
          where (profile_export_jsonl_gz is not null or profile_export_chunk_count > 0)
            and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
            ${runFilter}
          order by id
          ${flags.limit ? sql`limit ${flags.limit}` : sql``}
        `
      : await sql<{ id: number }[]>`
          select id
          from agentic_trace_replay
          where mod(id, ${flags.shardCount}) = ${flags.shardIndex}
            ${runFilter}
            and (
              (
                (
                  request_timeline_gz is null
                  or coalesce(request_timeline_version, -1) < ${REQUEST_TIMELINE_VERSION}
                )
                and (
                  (profile_export_jsonl_gz is not null or profile_export_chunk_count > 0)
                  or (request_timeline->>'version')::int = ${REQUEST_TIMELINE_VERSION}
                )
              )
              ${
                dropLegacyJsonb
                  ? sql`or (request_timeline is not null and request_timeline_gz is not null)`
                  : sql``
              }
            )
          order by id
          ${flags.limit ? sql`limit ${flags.limit}` : sql``}
        `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-request-timeline', sql, main);
