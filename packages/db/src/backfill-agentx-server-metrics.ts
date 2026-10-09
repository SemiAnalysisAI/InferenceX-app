/**
 * Recompute every AgentX server metric (KV-cache pools, cache hit rates, KV
 * usage, token totals) from stored raw data with the app's derivation,
 * replacing producer-computed values. Idempotent: unchanged rows are not
 * written, and values that cannot be derived are removed rather than kept.
 *
 * Usage:
 *   bun run --cwd packages/db db:backfill-agentx-server-metrics
 *     [--run-id N]               only rows of one GitHub workflow run
 *     [--shard-count N --shard-index I]
 *     [--limit N] [--dry-run] [--report FILE.jsonl] [--yes]
 */

import { appendFile, writeFile } from 'node:fs/promises';

import { hasNoSslFlag } from './cli-utils.js';
import { recomputeAgentxServerMetrics } from './etl/agentx-server-metrics/db.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import {
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();
const dryRun = process.argv.includes('--dry-run');
const reportIndex = process.argv.indexOf('--report');
const reportFile = reportIndex === -1 ? null : process.argv[reportIndex + 1];
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  console.log(`=== backfill-agentx-server-metrics: run ${githubRunId ?? 'all'} ===`);
  console.log(`  shard = ${flags.shardIndex + 1}/${flags.shardCount}, dry_run = ${dryRun}`);
  if (reportFile) await writeFile(reportFile, '');
  let changed = 0;
  const processed = await runCandidateIdBackfill(
    async () => {
      const rows = await sql<{ id: number }[]>`
        select br.id from benchmark_results br
        join workflow_runs wr on wr.id = br.workflow_run_id
        where br.benchmark_type = 'agentic_traces'
          and mod(br.id, ${flags.shardCount}) = ${flags.shardIndex}
          ${githubRunId ? sql`and wr.github_run_id = ${githubRunId}` : sql``}
        order by br.id desc
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;
      return rows.map((row) => row.id);
    },
    async (id) => {
      const [result] = await recomputeAgentxServerMetrics(sql, [id], { dryRun });
      if (!result) return 'skipped';
      if (result.changed) changed++;
      if (reportFile) await appendFile(reportFile, `${JSON.stringify(result)}\n`);
      return 'ok';
    },
  );
  console.log(`  ${changed} row(s) ${dryRun ? 'would change' : 'changed'}`);
  if (processed && changed > 0 && !dryRun) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-agentx-server-metrics', sql, main);
