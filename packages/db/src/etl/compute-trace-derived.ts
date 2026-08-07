/**
 * Compute every derived trace-replay payload while parsing server metrics only
 * once. The standalone aggregate/chart helpers remain the compatibility path
 * for backfills; ingest uses this coordinator to avoid repeated GiB-scale
 * decompression and JSON tokenization.
 */

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
import type { ServerMetricsContext } from './server-metrics-adapters.js';

export interface TraceDerivedPayloads {
  aggregateStats: AggregateStats;
  chartSeries: ChartSeries | null;
  requestTimeline: RequestTimeline | null;
}

export interface TraceDerivedComputeOptions {
  /** Override the bounded fast-path threshold, primarily for streaming tests. */
  maxInMemoryBytes?: number;
}

const DERIVED_SERVER_METRIC_KEYS = new Set([...CHART_METRIC_KEYS, ...AGGREGATE_SERVER_METRIC_KEYS]);

function selectMetrics(metrics: MetricsMap, wanted: ReadonlySet<string>): MetricsMap {
  const selected: MetricsMap = {};
  for (const [name, metric] of Object.entries(metrics)) {
    if (wanted.has(name)) selected[name] = metric;
  }
  return selected;
}

/**
 * Produce the same three JSON values previously computed independently in
 * `insertTraceReplay()`. Malformed inputs retain the old failure isolation:
 * profile stats/timeline can succeed without server metrics, and a chart
 * projection failure does not discard aggregate stats.
 */
export async function computeTraceDerivedPayloads(
  profileBlob: Buffer | null,
  serverBlob: Buffer | null,
  metricsContext: ServerMetricsContext = {},
  options: TraceDerivedComputeOptions = {},
): Promise<TraceDerivedPayloads> {
  const profileStatsPromise = computeAggregateStats({ profileBlob, serverBlob: null });
  const requestTimeline = computeRequestTimeline(profileBlob);

  const phases = serverBlob
    ? await collectMetricPhases<RawMetric>(
        serverBlob,
        DERIVED_SERVER_METRIC_KEYS,
        options.maxInMemoryBytes,
      ).catch(() => null)
    : null;
  let aggregateStats = await profileStatsPromise;
  let chartSeries: ChartSeries | null = null;

  if (phases) {
    const aggregateMetrics = phases.complete
      ? phases.metrics
      : selectMetrics(phases.metrics, AGGREGATE_SERVER_METRIC_KEYS);
    aggregateStats = withServerMetricAggregateStats(aggregateStats, aggregateMetrics);

    // The historical in-memory path builds chart timing metadata from every
    // metric, while its oversized streaming fallback retains only chart keys.
    // Preserve that distinction exactly even though the shared streaming pass
    // also collects the aggregate-only GPU prefix-cache aliases.
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

  return { aggregateStats, chartSeries, requestTimeline };
}
