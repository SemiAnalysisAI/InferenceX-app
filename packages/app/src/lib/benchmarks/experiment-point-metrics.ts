import { interTurnGaps, type InterTurnGaps } from './inter-turn-gaps';
import type { ExperimentRunDetail } from '@semianalysisai/inferencex-db/queries/experiments';
import { summarizeChartSeries } from '@semianalysisai/inferencex-db/etl/chart-series-summary';
import type { ChartSeries } from '@semianalysisai/inferencex-db/etl/compute-chart-series';
import type { RequestChartData } from '@/hooks/api/use-request-chart-data';
import type { RequestTimeline } from '@/hooks/api/use-request-timeline';
import type { MetricSourceSeries, TraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';

export interface ExperimentPointMetricsResponse {
  run: Pick<
    ExperimentRunDetail,
    | 'run_id'
    | 'config_name'
    | 'perf_changelog'
    | 'concurrency'
    | 'series'
    | 'configuration'
    | 'health'
    | 'frontier_eligible'
    | 'metrics'
    | 'plot_metrics'
  >;
  interTurnGaps: InterTurnGaps | null;
  aggregateStats: Record<string, unknown>;
  requestChartData: RequestChartData | null;
  requestTimeline: RequestTimeline | null;
  serverMetrics: Omit<TraceServerMetrics, 'meta'> | null;
  metricSourceSeries: MetricSourceSeries[];
}

/** Adapt stored traces through the same summary projection as ordinary benchmark points. */
export function experimentPointMetrics(row: ExperimentRunDetail): ExperimentPointMetricsResponse {
  const series = row.chart_series as unknown as ChartSeries;
  const timeline = row.request_timeline as unknown as RequestTimeline;
  const hasTimeline = Array.isArray(timeline.requests) && Number.isFinite(timeline.durationS);
  const hasSeries = Array.isArray(series.kvCacheUsage) && Number.isFinite(series.durationS);
  const sources = hasSeries ? (series.metricSources ?? []) : [];
  return {
    run: {
      run_id: row.run_id,
      config_name: row.config_name,
      perf_changelog: row.perf_changelog,
      concurrency: row.concurrency,
      series: row.series,
      configuration: row.configuration,
      health: row.health,
      frontier_eligible: row.frontier_eligible,
      metrics: row.metrics,
      plot_metrics: row.plot_metrics,
    },
    interTurnGaps:
      process.env.NEXT_PUBLIC_WEKA_PREVIEW === '1' && hasTimeline ? interTurnGaps(timeline) : null,
    aggregateStats: row.aggregate_stats,
    requestTimeline: hasTimeline ? timeline : null,
    requestChartData: hasTimeline
      ? {
          version: 2,
          timelineVersion: timeline.version,
          startNs: timeline.startNs,
          endNs: timeline.endNs,
          durationS: timeline.durationS,
          requests: timeline.requests.map(
            ({ cid, phase, start, end, ttftMs, tpotMs, isl, osl, cancelled }) => ({
              cid,
              phase,
              start,
              end,
              ttftMs,
              tpotMs,
              isl,
              osl,
              cancelled,
            }),
          ),
        }
      : null,
    serverMetrics: hasSeries
      ? {
          ...summarizeChartSeries(series, sources),
          kvCachePoolTokens: null,
        }
      : null,
    metricSourceSeries: sources,
  };
}
