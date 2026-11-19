import { hasNoSslFlag } from './cli-utils.js';
import { CHART_SERIES_SUMMARY_VERSION } from './etl/chart-series-summary.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';
import { backfillChartSeriesSummary } from './lib/chart-series-summary-backfill.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function processRow(id: number): Promise<'ok' | 'skipped'> {
  if (await backfillChartSeriesSummary(sql, id)) return 'ok';
  console.warn(`  id=${id}: no current chart_series, or it changed while reading it, skipping`);
  return 'skipped';
}

async function main(): Promise<void> {
  console.log('=== backfill-chart-series-summary ===');
  console.log(`  CHART_SERIES_SUMMARY_VERSION = ${CHART_SERIES_SUMMARY_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);
  console.log(`  shard = ${flags.shardIndex + 1}/${flags.shardCount}`);
  console.log(`  run_id = ${githubRunId ?? 'all'}`);

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
      : sql`and chart_series_summary_version is distinct from ${CHART_SERIES_SUMMARY_VERSION}`;
    const candidates = await sql<{ id: number }[]>`
      select id
      from agentic_trace_replay
      where chart_series is not null
        and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
        ${staleFilter}
        ${runFilter}
      order by id desc
      ${flags.limit ? sql`limit ${flags.limit}` : sql``}
    `;
    return candidates.map((candidate) => candidate.id);
  }, processRow);
}

runBackfillMain('backfill-chart-series-summary', sql, main);
