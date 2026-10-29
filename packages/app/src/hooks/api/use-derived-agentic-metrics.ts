import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface DerivedAgenticMetric {
  id: number;
  p75_e2e_norm_intvty: number | null;
  p90_e2e_norm_intvty: number | null;
}

export type DerivedAgenticMetricMap = Record<number, DerivedAgenticMetric>;

const fetchDerivedAgenticMetrics = bulkIdsFetcher<DerivedAgenticMetric>(
  'derived-agentic-metrics',
  200,
);

export function useDerivedAgenticMetrics(ids: number[], enabled = true) {
  return useBulkIdsQuery('derived-agentic-metrics', ids, enabled, fetchDerivedAgenticMetrics);
}
