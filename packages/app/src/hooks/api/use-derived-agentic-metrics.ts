import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface DerivedAgenticMetric {
  id: number;
  /** Slow-tail P75 E2E Normalized Interactivity in tok/s/user — 1 / p75(per-request E2EL/OSL).
   *  Null when the JSONL had no usable records. */
  p75_e2e_norm_intvty: number | null;
  /** Slow-tail P90 E2E Normalized Interactivity in tok/s/user — 1 / p90(per-request E2EL/OSL). */
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

// Unlike the other bulk endpoints, dashboards can put >200 agentic points on
// screen at once, so this fetcher splits the id set across parallel requests
// to stay under the route's MAX_IDS_PER_REQUEST.
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

/**
 * Fetch per-id derived agentic metrics (slow-tail E2E Normalized Interactivity tok/s/user)
 * computed live from the stored aiperf profile_export.jsonl. Used to drive
 * the "E2E Normalized Interactivity" chart variant.
 *
 * Ids without a trace_replay blob (older or non-aiperf agentic runs) are
 * silently omitted from the response.
 */
export function useDerivedAgenticMetrics(ids: number[], enabled = true) {
  return useBulkIdsQuery('derived-agentic-metrics', ids, enabled, fetchDerivedAgenticMetrics);
}
