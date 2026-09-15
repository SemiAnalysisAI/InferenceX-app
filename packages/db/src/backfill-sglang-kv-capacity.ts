import { hasNoSslFlag } from './cli-utils.js';
import type { RawMetric } from './etl/compute-chart-series.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { collectMetricPhases } from './etl/gzip-json-stream.js';
import {
  SGLANG_KV_CAPACITY_METRIC,
  sglangKvCachePoolTokensFromMetricPhases,
  updateSglangKvCachePoolTokens,
} from './etl/sglang-kv-capacity.js';
import { parseRunIdFlag, runBackfillMain } from './lib/backfill-runner.js';

const githubRunId = parseRunIdFlag();
if (githubRunId === undefined) throw new Error('--run-id is required');
const apply = process.argv.includes('--apply');
const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function main(): Promise<void> {
  const rows = await sql<{ id: number; tokens: string | null }[]>`
    select br.id, br.metrics ->> 'kv_cache_pool_tokens' as tokens
    from benchmark_results br
    join latest_workflow_runs wr on wr.id = br.workflow_run_id
    join configs c on c.id = br.config_id
    where wr.github_run_id = ${githubRunId!}
      and c.framework in ('sglang', 'mori-sglang', 'dynamo-sglang')
      and br.trace_replay_id is not null
    order by br.id
  `;
  const corrections: { id: number; tokens: number }[] = [];
  for (const row of rows) {
    const [raw] = await sql<{ blob: Buffer | null }[]>`
      select atr.server_metrics_json_gz as blob
      from benchmark_results br
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where br.id = ${row.id}
    `;
    if (!raw?.blob) throw new Error(`Missing metrics artifact for ${row.id}`);
    const phases = await collectMetricPhases<RawMetric>(
      raw.blob,
      new Set([SGLANG_KV_CAPACITY_METRIC]),
    );
    const tokens = sglangKvCachePoolTokensFromMetricPhases(phases.metrics, phases.warmupMetrics);
    if (tokens === null) throw new Error(`Ambiguous or non-constant SGLang capacity for ${row.id}`);
    console.log(`id=${row.id}: ${row.tokens ?? 'missing'} -> ${tokens} tokens`);
    if (row.tokens !== String(tokens)) corrections.push({ id: row.id, tokens });
  }
  if (!apply) {
    console.log(`Dry run: ${corrections.length} corrections; pass --apply to write.`);
    return;
  }
  await sql.begin(async (tx) => {
    for (const correction of corrections) {
      await updateSglangKvCachePoolTokens(tx, [correction.id], correction.tokens);
      const [verified] = await tx<{ tokens: string }[]>`
        select metrics ->> 'kv_cache_pool_tokens' as tokens
        from benchmark_results where id = ${correction.id}
      `;
      if (verified?.tokens !== String(correction.tokens)) {
        throw new Error(`Capacity verification failed for ${correction.id}`);
      }
    }
  });
  if (corrections.length > 0) await refreshLatestBenchmarks(sql);
}

runBackfillMain('backfill-sglang-kv-capacity', sql, main);
