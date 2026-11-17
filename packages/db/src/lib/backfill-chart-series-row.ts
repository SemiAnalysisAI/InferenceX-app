import {
  CHART_SERIES_SUMMARY_VERSION,
  encodeChartSeriesSummary,
} from '../etl/chart-series-summary.js';
import { CHART_SERIES_VERSION, type ChartSeries } from '../etl/compute-chart-series.js';
import type { Sql } from '../etl/db-utils.js';
import { writeCacheHitMetrics, type PreparedTraceReplay } from '../etl/trace-replay-ingest.js';
import { jsonbParam } from './backfill-runner.js';

export function writeChartSeriesBackfill(
  sql: Sql,
  id: number,
  series: ChartSeries,
  rates: PreparedTraceReplay['cacheHitRates'],
): Promise<boolean> {
  const json = JSON.stringify(series);
  return sql.begin(async (tx) => {
    const updated = await tx<{ id: number }[]>`
      update agentic_trace_replay
      set chart_series = ${jsonbParam(sql, series)},
          chart_series_summary_gz = ${encodeChartSeriesSummary(json)},
          chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION}
      where id = ${id}
        and coalesce((chart_series->>'version')::int, -1) <= ${CHART_SERIES_VERSION}
      returning id
    `;
    if (updated.length === 0) return false;
    if (rates) {
      const linked = await tx<{ id: number }[]>`
        select id from benchmark_results where trace_replay_id = ${id}
      `;
      await writeCacheHitMetrics(
        tx,
        linked.map((row) => row.id),
        rates,
      );
    }
    return true;
  });
}
