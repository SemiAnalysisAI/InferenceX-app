import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export interface TraceHistogramPoint {
  id: number;
  /** Input sequence length (tokens) per completed request. */
  isl: number[];
  /** Output sequence length (tokens) per completed request. */
  osl: number[];
}

export type TraceHistogramMap = Record<number, TraceHistogramPoint>;

const fetchTraceHistograms = bulkIdsFetcher<TraceHistogramPoint>('trace-histograms');

/**
 * Fetch per-request ISL/OSL arrays for a set of benchmark_results.id values.
 * Ids without a stored trace_replay blob are silently omitted from the response.
 *
 * Caller passes the agentic id set currently on screen; React Query handles
 * dedup + stale-while-revalidate. Cache key is sorted-ids-comma-joined so
 * any permutation of the same set hits the same cache entry.
 */
export function useTraceHistograms(ids: number[], enabled = true) {
  return useBulkIdsQuery('trace-histograms', ids, enabled, fetchTraceHistograms);
}
