/**
 * Recompute benchmark-row cache hit rates from each trace replay's stored
 * server-metrics export, using exact counter totals (see PromptTokenTotals).
 * Rows whose run carries an audited cache-rate override in
 * BENCHMARK_POINT_BACKFILLS keep their override value.
 *
 *   # compute once, write nothing, save the plan
 *   bun run db:backfill-cache-hit-rates --dry-run --plan-out plan.jsonl [--run-id N] [--limit N]
 *   # write the plan; a row is skipped if its stored rate changed since planning
 *   bun run db:backfill-cache-hit-rates --apply-plan plan.jsonl
 *   # compute and write in one pass
 *   bun run db:backfill-cache-hit-rates --run-id N
 */
import { appendFileSync, readFileSync } from 'node:fs';

import { hasNoSslFlag } from './cli-utils.js';
import { computeChartData } from './etl/compute-chart-series.js';
import { createAdminSql } from './etl/db-utils.js';
import { BENCHMARK_POINT_BACKFILLS, cacheRateOverrideRunIds } from './etl/run-overrides.js';
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
  replayId: number;
  run: number;
  hardware: string;
  model: string;
  framework: string;
  conc: number;
  oldGpu: number | null;
  oldCpu: number | null;
  newGpu: number;
  newCpu: number | null;
  keep: boolean;
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} requires a path`);
    process.exit(1);
  }
  return value;
}

const dryRun = process.argv.includes('--dry-run');
const planOut = argValue('--plan-out');
const applyPlan = argValue('--apply-plan');
const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();
const protectedRunIds = cacheRateOverrideRunIds(BENCHMARK_POINT_BACKFILLS);

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

const fmt = (value: number | null) => (value === null ? 'null' : value.toFixed(4));
const changed = (row: PlanRow) =>
  !row.keep && (row.oldGpu !== row.newGpu || (row.newCpu !== null && row.oldCpu !== row.newCpu));

/** Write one planned row unless its stored rates moved since the plan was made. */
async function writePlanRow(row: PlanRow): Promise<boolean> {
  const updated = await sql`
    update benchmark_results
    set metrics = jsonb_set(
      case when ${row.newCpu}::float8 is not null
        then jsonb_set(metrics, '{server_cpu_cache_hit_rate}', to_jsonb(${row.newCpu}::float8))
        else metrics
      end,
      '{server_gpu_cache_hit_rate}',
      to_jsonb(${row.newGpu}::float8)
    )
    where id = ${row.id}
      and (metrics->>'server_gpu_cache_hit_rate')::float8 is not distinct from ${row.oldGpu}::float8
      and (metrics->>'server_cpu_cache_hit_rate')::float8 is not distinct from ${row.oldCpu}::float8
  `;
  return updated.count === 1;
}

async function applyPlanFile(path: string): Promise<void> {
  const rows = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as PlanRow)
    .filter(changed);
  if (rows.length === 0) {
    console.log('\n  Nothing to do — plan has no changed rows.');
    return;
  }
  if (!(await confirmProceed(`${rows.length} row(s) in ${path} will be updated.`))) return;
  let written = 0;
  const stale: number[] = [];
  for (const row of rows) {
    if (await writePlanRow(row)) written++;
    else stale.push(row.id);
  }
  console.log(`\n=== apply complete: ${written} written, ${stale.length} skipped as changed ===`);
  if (stale.length > 0) console.log(`  skipped ids: ${stale.join(', ')}`);
}

async function computeReplay(id: number): Promise<PlanRow[] | null> {
  const [replay] = await sql<
    { server_metrics_json_gz: Buffer | null; framework: string | null; disagg: boolean | null }[]
  >`
    select atr.server_metrics_json_gz, source.framework, source.disagg
    from agentic_trace_replay atr
    left join lateral (
      select c.framework, c.disagg
      from benchmark_results br
      join configs c on c.id = br.config_id
      where br.trace_replay_id = atr.id
      order by br.id
      limit 1
    ) source on true
    where atr.id = ${id}
  `;
  if (!replay?.server_metrics_json_gz) return null;

  const data = await computeChartData(replay.server_metrics_json_gz, {
    framework: replay.framework,
    disagg: replay.disagg ?? false,
  });
  const rates = cacheHitRatesFromPromptTokenTotals(data?.promptTokenTotals ?? null);
  if (!rates) {
    console.log(`  id=${id}: no prompt-token counters, skipping`);
    return null;
  }

  const linked = await sql<
    {
      id: number;
      github_run_id: number;
      hardware: string;
      model: string;
      framework: string;
      conc: number;
      gpu: number | null;
      cpu: number | null;
    }[]
  >`
    select br.id, wr.github_run_id, c.hardware, c.model, c.framework, br.conc,
           (br.metrics->>'server_gpu_cache_hit_rate')::float8 as gpu,
           (br.metrics->>'server_cpu_cache_hit_rate')::float8 as cpu
    from benchmark_results br
    join workflow_runs wr on wr.id = br.workflow_run_id
    join configs c on c.id = br.config_id
    where br.trace_replay_id = ${id}
  `;
  return linked.map((row) => ({
    id: Number(row.id),
    replayId: Number(id),
    run: Number(row.github_run_id),
    hardware: row.hardware,
    model: row.model,
    framework: row.framework,
    conc: row.conc,
    oldGpu: row.gpu,
    oldCpu: row.cpu,
    newGpu: rates.gpu,
    newCpu: rates.cpu,
    keep: protectedRunIds.has(Number(row.github_run_id)),
  }));
}

async function main(): Promise<void> {
  console.log('=== backfill-cache-hit-rates ===');
  if (applyPlan) {
    console.log(`  apply_plan = ${applyPlan}`);
    await applyPlanFile(applyPlan);
    return;
  }
  console.log(`  dry_run = ${dryRun}`);
  console.log(`  plan_out = ${planOut ?? 'none'}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);
  console.log(`  shard = ${flags.shardIndex + 1}/${flags.shardCount}`);
  console.log(`  run_id = ${githubRunId ?? 'all'}`);
  console.log(`  override-protected runs = ${[...protectedRunIds].join(', ') || 'none'}`);
  console.log(
    '  ROW\tid\trun\thardware\tmodel\tframework\tconc\told_gpu\tnew_gpu\told_cpu\tnew_cpu',
  );

  await runCandidateIdBackfill(
    async () => {
      const candidates = await sql<{ id: number }[]>`
        select atr.id
        from agentic_trace_replay atr
        where atr.server_metrics_json_gz is not null
          and mod(atr.id, ${flags.shardCount}) = ${flags.shardIndex}
          and exists (
            select 1
            from benchmark_results br
            join workflow_runs wr on wr.id = br.workflow_run_id
            where br.trace_replay_id = atr.id
              ${githubRunId ? sql`and wr.github_run_id = ${githubRunId}` : sql``}
          )
        order by atr.id desc
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      const rows = await computeReplay(id);
      if (!rows) return 'skipped';
      for (const row of rows) {
        console.log(
          [
            row.keep ? '  KEEP' : '  ROW',
            row.id,
            row.run,
            row.hardware,
            row.model,
            row.framework,
            row.conc,
            fmt(row.oldGpu),
            fmt(row.keep ? row.oldGpu : row.newGpu),
            fmt(row.oldCpu),
            fmt(row.keep ? row.oldCpu : (row.newCpu ?? row.oldCpu)),
          ].join('\t'),
        );
        if (planOut) appendFileSync(planOut, `${JSON.stringify(row)}\n`);
      }
      if (dryRun) return 'ok';
      for (const row of rows.filter(changed)) await writePlanRow(row);
      return 'ok';
    },
    (count) =>
      dryRun
        ? `${count} trace replay(s) to recompute (dry run: nothing is written).`
        : `${count} trace replay(s) to recompute; linked rows' cache hit rates will be overwritten.`,
  );
}

runBackfillMain('backfill-cache-hit-rates', sql, main);
