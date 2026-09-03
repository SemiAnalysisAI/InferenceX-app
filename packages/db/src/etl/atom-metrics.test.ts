import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  CHART_METRIC_KEYS,
  computeChartSeries,
  computeChartSeriesFromMetricPhases,
  type MetricsMap,
  type RawMetric,
} from './compute-chart-series';
import { AGGREGATE_SERVER_METRIC_KEYS, computeAggregateStats } from './compute-aggregate-stats';
import { collectMetricPhases } from './gzip-json-stream';
import { extractServerMetricSamples } from '../queries/agentic-aggregates';

function metric(field: 'avg' | 'rate', values: number[], start = 0): RawMetric {
  return {
    series: [
      {
        endpoint_url: 'http://localhost:8895/metrics',
        timeslices: values.map((value, index) => ({
          start_ns: (start + index) * 1e9,
          end_ns: (start + index + 1) * 1e9,
          [field]: value,
        })),
      },
    ],
  };
}

function atomMetrics(): MetricsMap {
  return {
    'atom:kv_cache_usage_ratio': metric('avg', [0.2, 0.6]),
    'atom:requests_running': metric('avg', [4, 3]),
    'atom:requests_waiting': metric('avg', [2, 0]),
    'atom:prompt_tokens': metric('rate', [40, 200]),
    'atom:generation_tokens': metric('rate', [10, 20]),
    'atom:prefix_cache_cached_tokens': metric('rate', [80, 60]),
    'atom:prefix_cache_full_tokens': metric('rate', [100, 100]),
    'atom:prefix_cache_wanted_tokens': metric('rate', [80, 80]),
    'atom:prefix_cache_compressed_tokens': metric('rate', [90, 90]),
    'atom:prefix_cache_hit_ratio': metric('avg', [0.9, 0.85]),
    'atom:lmcache_loaded_tokens': metric('rate', [0, 30]),
  };
}

const blob = (metrics: MetricsMap, warmup_metrics: MetricsMap = {}) =>
  gzipSync(JSON.stringify({ metrics, warmup_metrics }));

describe('ATOM server metrics', () => {
  it('populates existing charts using admission cache counters and completed-request throughput', async () => {
    const result = (await computeChartSeries(blob(atomMetrics()), { framework: 'atom' }))!;
    expect(result.kvCacheUsage.map((p) => p.value)).toEqual([0.2, 0.6]);
    expect(result.queueDepth).toEqual([
      { t: 0, running: 4, waiting: 2, total: 6 },
      { t: 1, running: 3, waiting: 0, total: 3 },
    ]);
    expect(result.prefillTps.map((p) => p.value)).toEqual([40, 200]);
    expect(result.decodeTps.map((p) => p.value)).toEqual([10, 20]);
    expect(result.prefixCacheHitsTps.map((p) => p.value)).toEqual([80, 60]);
    expect(result.prefixCacheHitRate.map((p) => p.value)).toEqual([0.8, 0.6]);
    expect(result.promptTokensBySource['compute (miss)']?.map((p) => p.value)).toEqual([20, 40]);
    // The exporter provides a cluster-wide KV gauge, not per-DP-rank or CPU-pool gauges.
    expect(result.kvCacheUsageByEngine).toEqual([]);
    expect(result.hostKvCacheUsage).toEqual([]);
    expect(result.metricSources).toEqual([]);
  });

  it('computes aggregate distributions from the same admitted-cache definition', async () => {
    const result = await computeAggregateStats({
      profileBlob: null,
      serverBlob: blob(atomMetrics()),
    });
    expect(result.kvCacheUtil?.n).toBe(2);
    expect(result.kvCacheUtil?.mean).toBeCloseTo(0.4);
    expect(result.prefixCacheHitRate?.n).toBe(2);
    expect(result.prefixCacheHitRate?.mean).toBeCloseTo(0.7);
  });

  it('merges warmup without inventing a second engine and excludes warmup from aggregates', async () => {
    const warmup = { 'atom:kv_cache_usage_ratio': metric('avg', [0.1], -1) };
    const result = (await computeChartSeries(blob(atomMetrics(), warmup)))!;
    expect(result.kvCacheUsage.map((p) => p.value)).toEqual([0.1, 0.2, 0.6]);
    expect(result.kvCacheUsageByEngine).toEqual([]);
    const stats = await computeAggregateStats({
      profileBlob: null,
      serverBlob: blob(atomMetrics(), warmup),
    });
    expect(stats.kvCacheUtil?.n).toBe(2);
  });

  it('preserves zero cache hits and omits intervals with no cache queries', async () => {
    const metrics = {
      'atom:prefix_cache_cached_tokens': metric('rate', [0, 0]),
      'atom:prefix_cache_full_tokens': metric('rate', [100, 0]),
    };
    const result = (await computeChartSeries(blob(metrics)))!;
    expect(result.prefixCacheHitRate).toEqual([{ t: 0, value: 0 }]);
    expect(extractServerMetricSamples(JSON.stringify({ metrics })).prefixCacheHitRate).toEqual([0]);
  });

  it('supports gauge-only cache exports without confusing a ratio with a counter', async () => {
    const metrics = { 'atom:prefix_cache_hit_ratio': metric('avg', [0.7, 0.8]) };
    const result = (await computeChartSeries(blob(metrics)))!;
    expect(result.prefixCacheHitRate.map((p) => p.value)).toEqual([0.7, 0.8]);
    expect(result.prefixCacheHitsTps).toEqual([]);
    expect(extractServerMetricSamples(JSON.stringify({ metrics })).prefixCacheHitRate).toEqual([
      0.7, 0.8,
    ]);
  });

  it('retains ATOM metrics in the bounded-memory parser used for large exports', async () => {
    const original = atomMetrics();
    const warmup = { 'atom:kv_cache_usage_ratio': metric('avg', [0.1], -1) };
    const keys = new Set([...CHART_METRIC_KEYS, ...AGGREGATE_SERVER_METRIC_KEYS]);
    const parsed = await collectMetricPhases<RawMetric>(blob(original, warmup), keys, 1);
    expect(parsed.complete).toBe(false);
    expect(computeChartSeriesFromMetricPhases(parsed.metrics, parsed.warmupMetrics)).toEqual(
      computeChartSeriesFromMetricPhases(original, warmup),
    );
    expect(extractServerMetricSamples(JSON.stringify({ metrics: parsed.metrics }))).toEqual(
      extractServerMetricSamples(JSON.stringify({ metrics: original })),
    );
  });
});
