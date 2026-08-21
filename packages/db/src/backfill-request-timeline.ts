/**
 * Backfill `agentic_trace_replay.request_timeline` for rows that are
 * missing it or were computed by an older `REQUEST_TIMELINE_VERSION`.
 *
 * The ingest path now computes the timeline inline, but existing rows
 * (and rows whose computation logic has since changed) still need this
 * pass. Run after the agentic schema migration and any time the version bumps.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-request-timeline
 *     [--limit N]   only process the first N candidate rows
 *     [--force]     recompute every row, even if version already matches
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
  type RequestTimeline,
} from './etl/compute-request-timeline.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  TRACE_REPLAY_UPLOAD_CHUNK_BYTES,
  uploadTraceReplayPayloadChunks,
} from './etl/trace-replay-ingest.js';
import {
  confirmProceed,
  parseLimitForceFlags,
  runBackfillMain,
  runPerIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();

const PROFILE_DOWNLOAD_CHUNK_BYTES = TRACE_REPLAY_UPLOAD_CHUNK_BYTES;

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

/** Avoid Neon's encoded-response limit and postgres.js's large-value copies. */
async function readProfileBlob(id: number): Promise<Buffer | null> {
  const [sizeRow] = await sql<{ size: number | null }[]>`
    select octet_length(profile_export_jsonl_gz)::int as size
    from agentic_trace_replay
    where id = ${id}
  `;
  const size = sizeRow?.size;
  if (size === null || size === undefined) return null;

  const chunks: Buffer[] = [];
  for (let offset = 0; offset < size; offset += PROFILE_DOWNLOAD_CHUNK_BYTES) {
    const [chunkRow] = await sql<{ data: Buffer }[]>`
      select substring(
        profile_export_jsonl_gz
        from ${offset + 1}
        for ${PROFILE_DOWNLOAD_CHUNK_BYTES}
      ) as data
      from agentic_trace_replay
      where id = ${id}
    `;
    if (!chunkRow) return null;
    chunks.push(chunkRow.data);
  }
  return Buffer.concat(chunks, size);
}

/** Upload the JSONB through the same bounded protocol used by trace ingest. */
async function writeRequestTimeline(id: number, timeline: RequestTimeline | null): Promise<void> {
  if (timeline === null) {
    await sql`update agentic_trace_replay set request_timeline = null where id = ${id}`;
    return;
  }

  const payload = Buffer.from(JSON.stringify(timeline));
  await sql.begin(async (tx) => {
    await tx`
      create temporary table trace_replay_upload_parts (
        field text not null,
        part integer not null,
        data bytea not null,
        primary key (field, part)
      ) on commit drop
    `;
    await uploadTraceReplayPayloadChunks(tx, 'request_timeline', payload);
    await tx`
      update agentic_trace_replay
      set request_timeline = (
        select convert_from(string_agg(data, ''::bytea order by part), 'UTF8')::jsonb
        from pg_temp.trace_replay_upload_parts
        where field = 'request_timeline'
      )
      where id = ${id}
    `;
  });
}

async function main(): Promise<void> {
  console.log('=== backfill-request-timeline ===');
  console.log(`  REQUEST_TIMELINE_VERSION = ${REQUEST_TIMELINE_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  // Only rows with a profile_export blob can produce a timeline. Rows
  // without the blob keep `request_timeline` null and the API serves them
  // as "no timeline data".
  const candidates = flags.force
    ? await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        where profile_export_jsonl_gz is not null
        order by id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `
    : await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        where profile_export_jsonl_gz is not null
          and (
            request_timeline is null
            or coalesce((request_timeline->>'version')::int, -1) <> ${REQUEST_TIMELINE_VERSION}
          )
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
      const profileBlob = await readProfileBlob(id);
      if (profileBlob === null) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }
      const timeline = await computeRequestTimeline(profileBlob);
      await writeRequestTimeline(id, timeline);
      return 'ok';
    },
  );
}

runBackfillMain('backfill-request-timeline', sql, main);
