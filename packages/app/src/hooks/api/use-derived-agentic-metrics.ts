import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface DerivedAgenticMetric {
  id: number;
  p75_e2e_norm_intvty: number | null;
  p90_e2e_norm_intvty: number | null;
}

export type DerivedAgenticMetricMap = Record<number, DerivedAgenticMetric>;

const MAX_IDS_PER_REQUEST = 200;

export function chunkDerivedAgenticMetricIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
  }
  return chunks;
}

const fetchChunk = bulkIdsFetcher<DerivedAgenticMetric>('derived-agentic-metrics');

async function fetchDerivedAgenticMetrics(
  ids: number[],
  signal?: AbortSignal,
): Promise<DerivedAgenticMetricMap> {
  if (ids.length === 0) return {};
  const maps = await Promise.all(
    chunkDerivedAgenticMetricIds(ids).map((chunk) => fetchChunk(chunk, signal)),
  );
  return Object.assign({}, ...maps) as DerivedAgenticMetricMap;
}

export function useDerivedAgenticMetrics(ids: number[], enabled = true) {
  return useBulkIdsQuery('derived-agentic-metrics', ids, enabled, fetchDerivedAgenticMetrics);
}
