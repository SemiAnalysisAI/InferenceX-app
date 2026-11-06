/**
 * Recompute row cache hit rates from each trace replay's stored server metrics.
 *
 *   --plan <file> [--run-id N] [--limit N] [--shard-count N --shard-index I]
 *       compute and append { id, old, new } rows to <file>; writes nothing
 *   --apply <file>
 *       write planned rows whose stored rates still equal the planned old values
 *
 * Runs whose rates come from an audited BENCHMARK_POINT_BACKFILLS merge are never planned.
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { hasNoSslFlag } from './cli-utils.js';
import { computeChartData } from './etl/compute-chart-series.js';
import { createAdminSql } from './etl/db-utils.js';
import { BENCHMARK_POINT_BACKFILLS } from './etl/run-overrides.js';
import { cacheHitRatesFromPromptTokenTotals } from './etl/trace-replay-ingest.js';
import {
  confirmProceed,
  parseLimitForceFlags,
  parseRunIdFlag,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

interface PlanRow {
  id: number;
  oldGpu: number | null;
  oldCpu: number | null;
  newGpu: number;
  newCpu: number | null;
}

const argAfter = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
};
const planPath = argAfter('--plan');
const applyPath = argAfter('--apply');
const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();
const overrideRuns = new Set(
  BENCHMARK_POINT_BACKFILLS.filter((b) =>
    Object.keys(b.set.metricsMerge ?? {}).some((key) => key.endsWith('_cache_hit_rate')),
  ).map((b) => b.githubRunId),
);

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function plan(path: string): Promise<void> {
  await runCandidateIdBackfill(
    async () => {
      const rows = await sql<{ id: number }[]>`
        select atr.id from agentic_trace_replay atr
        where atr.server_metrics_json_gz is not null
          and mod(atr.id, ${flags.shardCount}) = ${flags.shardIndex}
          and exists (
            select 1 from benchmark_results br
            join workflow_runs wr on wr.id = br.workflow_run_id
            where br.trace_replay_id = atr.id
              ${githubRunId ? sql`and wr.github_run_id = ${githubRunId}` : sql``}
          )
        order by atr.id desc
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;
      return rows.map((row) => Number(row.id));
    },
    async (id) => {
      const [replay] = await sql<
        { blob: Buffer | null; framework: string | null; disagg: boolean | null }[]
      >`
        select atr.server_metrics_json_gz as blob, c.framework, c.disagg
        from agentic_trace_replay atr
        join benchmark_results br on br.trace_replay_id = atr.id
        join configs c on c.id = br.config_id
        where atr.id = ${id}
        order by br.id
        limit 1
      `;
      const data = await computeChartData(replay?.blob ?? null, {
        framework: replay?.framework,
        disagg: replay?.disagg ?? false,
      });
      const rates = cacheHitRatesFromPromptTokenTotals(data?.promptTokenTotals ?? null);
      if (!rates) return 'skipped';
      const linked = await sql<
        { id: number; run: number; gpu: number | null; cpu: number | null }[]
      >`
        select br.id, wr.github_run_id as run,
               (br.metrics->>'server_gpu_cache_hit_rate')::float8 as gpu,
               (br.metrics->>'server_cpu_cache_hit_rate')::float8 as cpu
        from benchmark_results br
        join workflow_runs wr on wr.id = br.workflow_run_id
        where br.trace_replay_id = ${id}
      `;
      for (const row of linked.filter((r) => !overrideRuns.has(Number(r.run)))) {
        const planned: PlanRow = {
          id: Number(row.id),
          oldGpu: row.gpu,
          oldCpu: row.cpu,
          newGpu: rates.gpu,
          newCpu: rates.cpu,
        };
        appendFileSync(path, `${JSON.stringify(planned)}\n`);
      }
      return 'ok';
    },
  );
}

async function apply(path: string): Promise<void> {
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PlanRow)
    .filter((r) => r.oldGpu !== r.newGpu || (r.newCpu !== null && r.oldCpu !== r.newCpu));
  if (!(await confirmProceed(`${rows.length} changed row(s) in ${path}.`))) return;
  let written = 0;
  for (const r of rows) {
    const result = await sql`
      update benchmark_results
      set metrics = metrics || jsonb_strip_nulls(jsonb_build_object(
        'server_gpu_cache_hit_rate', ${r.newGpu}::float8,
        'server_cpu_cache_hit_rate', ${r.newCpu}::float8
      ))
      where id = ${r.id}
        and (metrics->>'server_gpu_cache_hit_rate')::float8 is not distinct from ${r.oldGpu}::float8
        and (metrics->>'server_cpu_cache_hit_rate')::float8 is not distinct from ${r.oldCpu}::float8
    `;
    written += result.count;
  }
  console.log(`  ${written} written, ${rows.length - written} skipped as changed since planning`);
}

runBackfillMain('backfill-cache-hit-rates', sql, async () => {
  if (applyPath) await apply(applyPath);
  else if (planPath) await plan(planPath);
  else throw new Error('pass --plan <file> or --apply <file>');
});
