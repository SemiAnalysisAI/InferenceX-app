import { hasNoSslFlag } from './cli-utils.js';
import {
  CHART_SERIES_VERSION,
  computeChartSeries,
  type ChartSeries,
} from './etl/compute-chart-series.js';
import { createAdminSql } from './etl/db-utils.js';
import { cacheHitRatesFromChartSeries, writeCacheHitMetrics } from './etl/trace-replay-ingest.js';
import {
  jsonbParam,
  parseLimitForceFlags,
  parseRunIdFlag,
  requireBackfillPayload,
  retainPopulatedFields,
  runBackfillMain,
  runCandidateIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();
const githubRunId = parseRunIdFlag();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function main(): Promise<void> {
  console.log('=== backfill-chart-series ===');
  console.log(`  CHART_SERIES_VERSION = ${CHART_SERIES_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);
  console.log(`  shard = ${flags.shardIndex + 1}/${flags.shardCount}`);
  console.log(`  run_id = ${githubRunId ?? 'all'}`);

  await runCandidateIdBackfill(
    async () => {
      const runFilter = githubRunId
        ? sql`
            and exists (
              select 1
              from benchmark_results br
              join workflow_runs wr on wr.id = br.workflow_run_id
              where br.trace_replay_id = agentic_trace_replay.id
                and wr.github_run_id = ${githubRunId}
            )
          `
        : sql``;
      const candidates = flags.force
        ? await sql<{ id: number }[]>`
            select id
            from agentic_trace_replay
            where server_metrics_json_gz is not null
              and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
              ${runFilter}
            -- Restore the newest, most actively viewed runs first. The backfill is
            -- idempotent, so an interrupted pass resumes with only stale rows.
            order by id desc
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `
        : await sql<{ id: number }[]>`
            select id
            from agentic_trace_replay
            where server_metrics_json_gz is not null
              and mod(id, ${flags.shardCount}) = ${flags.shardIndex}
              and (
                chart_series is null
                or coalesce((chart_series->>'version')::int, -1) < ${CHART_SERIES_VERSION}
              )
              ${runFilter}
            -- Restore the newest, most actively viewed runs first. The backfill is
            -- idempotent, so an interrupted pass resumes with only stale rows.
            order by id desc
            ${flags.limit ? sql`limit ${flags.limit}` : sql``}
          `;
      return candidates.map((candidate) => candidate.id);
    },
    async (id) => {
      const [row] = await sql<
        {
          server_metrics_json_gz: Buffer | null;
          framework: string | null;
          disagg: boolean | null;
          chart_series: ChartSeries | null;
        }[]
      >`
        select atr.server_metrics_json_gz, atr.chart_series, source.framework, source.disagg
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
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const series = requireBackfillPayload(
        await computeChartSeries(row.server_metrics_json_gz, {
          framework: row.framework,
          disagg: row.disagg ?? false,
        }),
        'chart_series',
      );
      retainPopulatedFields(row.chart_series, series, [
        'kvCacheUsage',
        'queueDepth',
        'prefixCacheHitRate',
        'prefillTps',
        'decodeTps',
        'prefixCacheHitsTps',
        'hostKvCacheUsage',
      ]);

      await sql`
        update agentic_trace_replay
        set chart_series = ${jsonbParam(sql, series)}
        where id = ${id}
          and coalesce((chart_series->>'version')::int, -1) <= ${CHART_SERIES_VERSION}
      `;
      // ATOM P/D row cache rates come from this chart series at ingest, so
      // refresh them with it. Other frameworks keep their ingested values.
      const atomPd = row.framework === 'mooncake-atom' || row.framework === 'atom-disagg';
      const rates = atomPd ? cacheHitRatesFromChartSeries(series) : null;
      if (rates) {
        const linked = await sql<{ id: number }[]>`
          select id from benchmark_results where trace_replay_id = ${id}
        `;
        await writeCacheHitMetrics(
          sql,
          linked.map((r) => r.id),
          rates,
        );
      }
      return 'ok';
    },
  );
}

runBackfillMain('backfill-chart-series', sql, main);
