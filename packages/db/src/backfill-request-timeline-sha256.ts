import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  parseLimitForceFlags,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 4,
  onnotice: () => {},
});

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  const updated = await sql`
    update agentic_trace_replay
    set request_timeline_sha256 = null
    where id = ${id}
      and request_timeline_gz is not null
  `;
  return updated.count === 1 ? 'ok' : 'skipped';
}

async function main(): Promise<void> {
  console.log('=== backfill-request-timeline-sha256 ===');
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  await runCandidateIdBackfill(async () => {
    const candidates = await sql<{ id: number }[]>`
      select id
      from agentic_trace_replay
      where request_timeline_gz is not null
        and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
        ${flags.force ? sql`` : sql`and request_timeline_sha256 is null`}
      order by id
      ${flags.limit ? sql`limit ${flags.limit}` : sql``}
    `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-request-timeline-sha256', sql, main);
