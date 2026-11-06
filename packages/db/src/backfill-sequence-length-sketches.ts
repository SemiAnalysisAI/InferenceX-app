import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';
import {
  computeSequenceLengthSketches,
  writeSequenceLengthSketches,
} from './lib/sequence-length-sketches-backfill.js';
import { SEQUENCE_LENGTH_SKETCHES_VERSION, STATS_VERSION } from './queries/agentic-shared.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 4,
  onnotice: () => {},
});

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  const stored = await computeSequenceLengthSketches(sql, id);
  if (!stored) {
    console.warn(`  id=${id}: stats are not current or do not encode exactly, skipping`);
    return 'skipped';
  }
  if (!(await writeSequenceLengthSketches(sql, id, stored))) {
    console.warn(`  id=${id}: aggregate_stats changed while reading it, skipping`);
    return 'skipped';
  }
  return 'ok';
}

async function main(): Promise<void> {
  console.log('=== backfill-sequence-length-sketches ===');
  console.log(`  SEQUENCE_LENGTH_SKETCHES_VERSION = ${SEQUENCE_LENGTH_SKETCHES_VERSION}`);
  console.log(`  force = ${flags.force}`);
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
    const staleFilter = flags.force
      ? sql``
      : sql`and sequence_length_sketches_version is distinct from ${SEQUENCE_LENGTH_SKETCHES_VERSION}`;
    const candidates = await sql<{ id: number }[]>`
      select id
      from agentic_trace_replay
      where aggregate_stats->'version' = to_jsonb(${STATS_VERSION}::int)
        and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
        ${staleFilter}
        ${runFilter}
      order by id
      ${flags.limit ? sql`limit ${flags.limit}` : sql``}
    `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-sequence-length-sketches', sql, main);
