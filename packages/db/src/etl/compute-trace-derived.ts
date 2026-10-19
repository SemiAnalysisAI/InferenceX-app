import {
  AGGREGATE_SERVER_METRIC_KEYS,
  computeAggregateStats,
  withServerMetricAggregateStats,
  type AggregateStats,
} from './compute-aggregate-stats.js';
import {
  CHART_METRIC_KEYS,
  computeChartSeriesFromMetricPhases,
  type ChartSeries,
  type MetricsMap,
  type RawMetric,
} from './compute-chart-series.js';
import { computeRequestTimeline, type RequestTimeline } from './compute-request-timeline.js';
import { collectMetricPhases } from './gzip-json-stream.js';
import { ATOM_KV_BLOCKS_METRIC, atomKvCacheBlocksFromMetricPhases } from './atom-kv-capacity.js';
import type { ServerMetricsContext } from './server-metrics-adapters.js';

export interface TraceDerivedPayloads {
  aggregateStats: AggregateStats;
  chartSeries: ChartSeries | null;
  requestTimeline: RequestTimeline | null;
  atomKvCacheBlocks: number | null;
}

export interface TraceDerivedComputeOptions {
  maxInMemoryBytes?: number;
}

const DERIVED_SERVER_METRIC_KEYS = new Set([
  ...CHART_METRIC_KEYS,
  ...AGGREGATE_SERVER_METRIC_KEYS,
  ATOM_KV_BLOCKS_METRIC,
]);

function selectMetrics(metrics: MetricsMap, wanted: ReadonlySet<string>): MetricsMap {
  const selected: MetricsMap = {};
  for (const [name, metric] of Object.entries(metrics)) {
    if (wanted.has(name)) selected[name] = metric;
  }
  return selected;
}

export async function computeTraceDerivedPayloads(
  profileBlob: Buffer | null,
  serverBlob: Buffer | null,
  metricsContext: ServerMetricsContext = {},
  options: TraceDerivedComputeOptions = {},
): Promise<TraceDerivedPayloads> {
  const profileStatsPromise = computeAggregateStats({ profileBlob, serverBlob: null });
  const requestTimelinePromise = computeRequestTimeline(profileBlob);

  const phases = serverBlob
    ? await collectMetricPhases<RawMetric>(
        serverBlob,
        DERIVED_SERVER_METRIC_KEYS,
        options.maxInMemoryBytes,
      ).catch(() => null)
    : null;
  const [initialAggregateStats, requestTimeline] = await Promise.all([
    profileStatsPromise,
    requestTimelinePromise,
  ]);
  let aggregateStats = initialAggregateStats;
  let chartSeries: ChartSeries | null = null;

  if (phases) {
    const aggregateMetrics = phases.complete
      ? phases.metrics
      : selectMetrics(phases.metrics, AGGREGATE_SERVER_METRIC_KEYS);
    aggregateStats = withServerMetricAggregateStats(aggregateStats, aggregateMetrics);

    const profiling = phases.complete
      ? phases.metrics
      : selectMetrics(phases.metrics, CHART_METRIC_KEYS);
    const warmup = phases.complete
      ? phases.warmupMetrics
      : selectMetrics(phases.warmupMetrics, CHART_METRIC_KEYS);
    try {
      chartSeries = computeChartSeriesFromMetricPhases(profiling, warmup, metricsContext);
    } catch {
      chartSeries = null;
    }
  }

  return {
    aggregateStats,
    chartSeries,
    requestTimeline,
    atomKvCacheBlocks: phases
      ? atomKvCacheBlocksFromMetricPhases(phases.metrics, phases.warmupMetrics)
      : null,
  };
}
