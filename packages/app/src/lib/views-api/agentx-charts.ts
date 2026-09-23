import { summarizeDistribution } from '@/components/inference/agentic-point/lognormal';
import type { ServerSeriesLike } from '@/components/inference/agentic-point/phase-slice';
import {
  averageSequenceLengthInFlight,
  buildThroughputChartSeries,
  buildPrefixCacheHitRateSeries,
  cumulativeCompletedRequests,
  cumulativeTimeAverage,
  inflightUniqueTokens,
  quantile,
  rollingAverage,
  rollingRequestMetric,
  timeRollingAverage,
  type RequestPercentile,
  type ThroughputSeriesKey,
} from '@/components/inference/agentic-point/time-series-math';
import type { RequestChartData } from '@/lib/request-chart-data';

/** Numerical outputs behind point-page toggles; no new sampling or estimator. */
export function agentxCharts(
  requests: RequestChartData,
  server: ServerSeriesLike | null,
  percentile: RequestPercentile,
  latencyMetric: 'ttft' | 'e2e',
  throughput: readonly ThroughputSeriesKey[],
) {
  const sequence = (metric: 'isl' | 'osl') => {
    // Distribution cards retain all finite lengths, including cancelled requests.
    // The in-flight helper has its own cancellation rules; do not unify populations.
    const values = requests.requests
      .map((row) => row[metric])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const { sorted: positive, histogram, excluded } = summarizeDistribution(values);
    const raw = averageSequenceLengthInFlight(requests.requests, metric);
    return {
      distribution: {
        count: values.length,
        excludedFromLog: excluded,
        histogram,
        percentiles:
          positive.length > 0
            ? {
                p50: quantile(positive, 0.5),
                p75: quantile(positive, 0.75),
                p90: quantile(positive, 0.9),
                p95: quantile(positive, 0.95),
              }
            : null,
      },
      inflight: { raw, smoothed: timeRollingAverage(raw, 30) },
    };
  };
  const inflight = inflightUniqueTokens(requests.requests);
  return {
    assumptions: {
      requestWindow: 50,
      serverWindow: 50,
      inflightWindowS: 30,
      throughputBurnInS: 60,
      sequenceLengthUnit: 'tokens',
      latencyUnit: 'seconds',
      interactivityUnit: 'tokens/second/user',
      serverTimeUnit: 'seconds',
      cacheUtilizationUnit: 'fraction',
      oslInflightBasis: 'retrospective-final-observed-output',
    },
    latency: rollingRequestMetric(requests.requests, latencyMetric, percentile, 50),
    interactivity: rollingRequestMetric(requests.requests, 'interactivity', percentile, 50),
    sequence: { isl: sequence('isl'), osl: sequence('osl') },
    completedRequests: cumulativeCompletedRequests(requests.requests),
    inflightUniqueTokens: {
      raw: inflight,
      smoothed: timeRollingAverage(inflight, 30),
      cumulative: cumulativeTimeAverage(inflight),
    },
    server: server
      ? {
          throughput: buildThroughputChartSeries(
            server.prefillTps,
            server.decodeTps,
            new Set(throughput),
          ),
          kvCacheUsage: rollingAverage(server.kvCacheUsage, 50),
          hostKvCacheUsage: rollingAverage(server.hostKvCacheUsage, 50),
          kvCacheUsageByEngine: server.kvCacheUsageByEngine.map(({ engineLabel, points }) => ({
            engineLabel,
            points: rollingAverage(points, 50),
          })),
          prefixCacheHitRate: buildPrefixCacheHitRateSeries(server),
          queueDepth: Object.fromEntries(
            (['running', 'waiting', 'total'] as const).map((key) => [
              key,
              rollingAverage(
                server.queueDepth.map((row) => ({ t: row.t, value: row[key] })),
                50,
              ),
            ]),
          ),
        }
      : null,
  };
}
