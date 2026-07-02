/**
 * Backfill `agentic_trace_replay.request_timeline` for rows that are
 * missing it or were computed by an older `REQUEST_TIMELINE_VERSION`.
 *
 * The ingest path now computes the timeline inline, but existing rows
 * (and rows whose computation logic has since changed) still need this
 * pass. Run after the agentic schema migration and any time the version bumps.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-request-timeline
 *     [--limit N]   only process the first N candidate rows
 *     [--force]     recompute every row, even if version already matches
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
} from './etl/compute-request-timeline.js';
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
      const [row] = await sql<{ profile_export_jsonl_gz: Buffer | null }[]>`
        select profile_export_jsonl_gz
        from agentic_trace_replay
        where id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }
      const timeline = computeRequestTimeline(row.profile_export_jsonl_gz);
      await sql`
        update agentic_trace_replay
        set request_timeline = ${timeline === null ? null : jsonbParam(sql, timeline)}
        where id = ${id}
      `;
      return 'ok';
    },
  );
}

runBackfillMain('backfill-request-timeline', sql, main);
