import { createHash } from 'node:crypto';

import {
  CHART_SERIES_SUMMARY_VERSION,
  encodeChartSeriesSummary,
} from '../etl/chart-series-summary.js';
import { CHART_SERIES_VERSION } from '../etl/compute-chart-series.js';
import type { Sql } from '../etl/db-utils.js';

/**
 * Store the summary of a row's current `chart_series`. Returns false, and
 * writes nothing, when the row has no current chart series or it changed
 * while the summary was computed.
 */
export async function backfillChartSeriesSummary(
  sql: Sql,
  traceReplayId: number,
): Promise<boolean> {
  const [row] = await sql<{ chart_series: string }[]>`
    select chart_series::text as chart_series
    from agentic_trace_replay
    where id = ${traceReplayId}
      and (chart_series->>'version')::int = ${CHART_SERIES_VERSION}
  `;
  if (!row) return false;
  // jsonb text already has jsonb's key order, so this summarizes exactly what
  // the route reads.
  const summary = encodeChartSeriesSummary(row.chart_series);
  const updated = await sql<{ id: number }[]>`
    update agentic_trace_replay
    set chart_series_summary_gz = ${summary},
        chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION}
    where id = ${traceReplayId}
      and md5(chart_series::text) = ${createHash('md5').update(row.chart_series).digest('hex')}
    returning id
  `;
  return updated.length > 0;
}
