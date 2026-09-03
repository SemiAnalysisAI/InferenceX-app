import { hasNoSslFlag } from './cli-utils.js';
import {
  ATOM_KV_BLOCKS_METRIC,
  atomKvCacheBlocksFromMetricPhases,
  updateAtomKvCachePoolTokens,
} from './etl/atom-kv-capacity.js';
import type { RawMetric } from './etl/compute-chart-series.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { collectMetricPhases } from './etl/gzip-json-stream.js';
import { parseRunIdFlag, runBackfillMain, runCandidateIdBackfill } from './lib/backfill-runner.js';

function requiredRunId(): number {
  const runId = parseRunIdFlag();
  if (runId === undefined) throw new Error('--run-id is required');
  return runId;
}
const githubRunId = requiredRunId();
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  console.log(`=== backfill-atom-kv-capacity: run ${githubRunId} ===`);
  const processed = await runCandidateIdBackfill(
    async () => {
      const rows = await sql<{ id: number }[]>`
        select br.id from benchmark_results br
        join latest_workflow_runs wr on wr.id = br.workflow_run_id
        join configs c on c.id = br.config_id
        where wr.github_run_id = ${githubRunId}
          and c.framework = 'atom' and not c.disagg
          and br.server_log_id is not null and br.trace_replay_id is not null
        order by br.id
      `;
      return rows.map((row) => row.id);
    },
    async (id) => {
      const [row] = await sql<{ blob: Buffer | null }[]>`
        select atr.server_metrics_json_gz as blob
        from benchmark_results br
        join agentic_trace_replay atr on atr.id = br.trace_replay_id
        where br.id = ${id}
      `;
      if (!row?.blob) throw new Error('Missing ATOM metrics artifact');
      const phases = await collectMetricPhases<RawMetric>(
        row.blob,
        new Set([ATOM_KV_BLOCKS_METRIC]),
      );
      const blocks = atomKvCacheBlocksFromMetricPhases(phases.metrics, phases.warmupMetrics);
      if (blocks === null) throw new Error('Missing or non-constant ATOM pool block count');
      if ((await updateAtomKvCachePoolTokens(sql, [id], blocks)) !== 1) {
        throw new Error('No unambiguous ATOM startup capacity');
      }
      const [verified] = await sql<{ tokens: string | null }[]>`
        select metrics ->> 'kv_cache_pool_tokens' as tokens from benchmark_results where id = ${id}
      `;
      if (!verified?.tokens) throw new Error('No unambiguous ATOM startup capacity');
      console.log(`  id=${id}: ${verified.tokens} tokens (${blocks} allocated blocks)`);
      return 'ok';
    },
  );
  if (processed) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-atom-kv-capacity', sql, main);
