import {
  AGGREGATE_SERVER_METRIC_KEYS,
  computeAggregateStats,
  withServerMetricAggregateStats,
  type AggregateStats,
} from './compute-aggregate-stats.js';
import {
  CHART_METRIC_KEYS,
  computeChartDataFromMetricPhases,
  type ChartSeries,
  type MetricsMap,
  type PromptTokenTotals,
  type RawMetric,
} from './compute-chart-series.js';
import { computeRequestTimeline, type RequestTimeline } from './compute-request-timeline.js';
import { collectMetricPhases } from './gzip-json-stream.js';
import { ATOM_KV_BLOCKS_METRIC, atomKvCacheBlocksFromMetricPhases } from './atom-kv-capacity.js';
import type { ServerMetricsContext } from './server-metrics-adapters.js';
import { errorMessage } from '../lib/error-message.js';

export interface TraceDerivedPayloads {
  aggregateStats: AggregateStats;
  chartSeries: ChartSeries | null;
  promptTokenTotals: PromptTokenTotals | null;
  requestTimeline: RequestTimeline | null;
  atomKvCacheBlocks: number | null;
  /** Inputs that could not be read, each leaving its derived payload empty. Ingest reports them. */
  warnings: string[];
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
  const warnings: string[] = [];
  const profileStatsPromise = computeAggregateStats({ profileBlob, serverBlob: null }, warnings);
  const requestTimelinePromise = computeRequestTimeline(profileBlob);

  const phases = serverBlob
    ? await collectMetricPhases<RawMetric>(
        serverBlob,
        DERIVED_SERVER_METRIC_KEYS,
        options.maxInMemoryBytes,
      ).catch((error: unknown) => {
        warnings.push(
          `server metrics unreadable (${errorMessage(error)}), so the chart series and ` +
            'KV cache and prefix cache stats are empty',
        );
        return null;
      })
    : null;
  const [initialAggregateStats, requestTimeline] = await Promise.all([
    profileStatsPromise,
    requestTimelinePromise,
  ]);
  let aggregateStats = initialAggregateStats;
  let chartSeries: ChartSeries | null = null;
  let promptTokenTotals: PromptTokenTotals | null = null;

  if (phases) {
    const aggregateMetrics = phases.complete
      ? phases.metrics
      : selectMetrics(phases.metrics, AGGREGATE_SERVER_METRIC_KEYS);
    aggregateStats = withServerMetricAggregateStats(aggregateStats, aggregateMetrics, warnings);

    const profiling = phases.complete
      ? phases.metrics
      : selectMetrics(phases.metrics, CHART_METRIC_KEYS);
    const warmup = phases.complete
      ? phases.warmupMetrics
      : selectMetrics(phases.warmupMetrics, CHART_METRIC_KEYS);
    try {
      const data = computeChartDataFromMetricPhases(profiling, warmup, metricsContext);
      chartSeries = data.series;
      promptTokenTotals = data.promptTokenTotals;
      if (promptTokenTotals.rolesUnidentified) {
        warnings.push(
          'disaggregated TRT-LLM server metrics name no prefill or decode endpoint, so the ' +
            "prefix cache hit rate keeps the run's reported value",
        );
      }
    } catch (error) {
      warnings.push(`chart series failed (${errorMessage(error)}), so it is empty`);
    }
  }

  return {
    aggregateStats,
    chartSeries,
    promptTokenTotals,
    requestTimeline,
    atomKvCacheBlocks: phases
      ? atomKvCacheBlocksFromMetricPhases(phases.metrics, phases.warmupMetrics)
      : null,
    warnings,
  };
}
