/**
 * Fill `agentic_trace_replay.sla_attempts_gz` for rows ingested before SLA
 * Targets existed, from the original profile export each row already stores.
 *
 * What this recovers: the explicit outcome of every attempt that has a record
 * (completed, failed with its error class, cancelled) and its latencies.
 * What it cannot recover: the number of requests the harness issued and the
 * attempts it cancelled at the cutoff without a record. Those live only in the
 * harness log, which the app did not store before ingest started reading it,
 * so a backfilled row carries a lower bound and its results stay exploratory.
 *
 * Usage: bun run --cwd packages/db db:backfill-sla-attempts [--limit N] [--force]
 *        [--run-id <github run id>] [--shard-index I --shard-count N] [--no-ssl]
 */

import { hasNoSslFlag } from './cli-utils.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  SLA_ATTEMPTS_VERSION,
  encodeSlaAttempts,
  slaAttemptsFromExport,
  slaAttemptsSha256,
} from './etl/sla-attempts.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';
import { readTraceProfileLines } from './lib/trace-profile-storage.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  const blob = await slaAttemptsFromExport(readTraceProfileLines(sql, id));
  const gz = encodeSlaAttempts(blob);
  const updated = await sql`
    update agentic_trace_replay
    set sla_attempts_gz = ${gz},
        sla_attempts_version = ${SLA_ATTEMPTS_VERSION},
        sla_attempts_sha256 = ${Buffer.from(slaAttemptsSha256(gz), 'hex')}
    where id = ${id}
      and (${flags.force} or coalesce(sla_attempts_version, -1) < ${SLA_ATTEMPTS_VERSION})
    returning id
  `;
  if (updated.length === 0) {
    console.warn(`  id=${id}: row vanished or already holds current attempt data, skipping`);
    return 'skipped';
  }
  return 'ok';
}

async function main(): Promise<void> {
  console.log('=== backfill-sla-attempts ===');
  console.log(`  SLA_ATTEMPTS_VERSION = ${SLA_ATTEMPTS_VERSION}`);
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
      : sql`and (
          sla_attempts_gz is null
          or coalesce(sla_attempts_version, -1) < ${SLA_ATTEMPTS_VERSION}
        )`;
    const candidates = await sql<{ id: number }[]>`
      select id
      from agentic_trace_replay
      where (profile_export_jsonl_gz is not null or profile_export_chunk_count > 0)
        and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
        ${runFilter}
        ${staleFilter}
      order by id
      ${flags.limit ? sql`limit ${flags.limit}` : sql``}
    `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-sla-attempts', sql, main);
