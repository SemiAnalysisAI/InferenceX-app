import { hasNoSslFlag } from './cli-utils.js';
import { REQUEST_TIMELINE_VERSION } from './etl/compute-request-timeline.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';
import {
  computeRequestChartColumns,
  writeRequestChartColumns,
} from './lib/request-chart-data-backfill.js';
import { REQUEST_CHART_DATA_VERSION } from './queries/request-chart-data.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 4,
  onnotice: () => {},
});

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  const stored = await computeRequestChartColumns(sql, id);
  if (!stored) {
    console.warn(`  id=${id}: no current gzip timeline, skipping`);
    return 'skipped';
  }
  if (!(await writeRequestChartColumns(sql, id, stored))) {
    console.warn(`  id=${id}: timeline changed while reading it, skipping`);
    return 'skipped';
  }
  return 'ok';
}

async function main(): Promise<void> {
  console.log('=== backfill-request-chart-data ===');
  console.log(`  REQUEST_CHART_DATA_VERSION = ${REQUEST_CHART_DATA_VERSION}`);
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
          request_chart_data_gz is null
          or request_chart_data_version is distinct from ${REQUEST_CHART_DATA_VERSION}
        )`;
    const candidates = await sql<{ id: number }[]>`
      select id
      from agentic_trace_replay
      where request_timeline_gz is not null
        and request_timeline_version = ${REQUEST_TIMELINE_VERSION}
        and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
        ${staleFilter}
        ${runFilter}
      order by id
      ${flags.limit ? sql`limit ${flags.limit}` : sql``}
    `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-request-chart-data', sql, main);
