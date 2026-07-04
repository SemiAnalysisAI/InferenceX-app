import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface MetricPercentiles {
  mean: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
  n: number;
}

export interface AgenticAggregate {
  id: number;
  isl: MetricPercentiles | null;
  osl: MetricPercentiles | null;
  kvCacheUtil: MetricPercentiles | null;
  prefixCacheHitRate: MetricPercentiles | null;
}

export type AgenticAggregateMap = Record<number, AgenticAggregate>;

const fetchAgenticAggregates = bulkIdsFetcher<AgenticAggregate>('agentic-aggregates');

/**
 * Fetch per-id aggregate stats (mean/p50/p75/p90/p99) for ISL, OSL, KV
 * cache utilization, and prefix cache hit rate. Used by the "Aggregates
 * across configs" view on the agentic detail page.
 */
export function useAgenticAggregates(ids: number[], enabled = true) {
  return useBulkIdsQuery('agentic-aggregates', ids, enabled, fetchAgenticAggregates);
}
