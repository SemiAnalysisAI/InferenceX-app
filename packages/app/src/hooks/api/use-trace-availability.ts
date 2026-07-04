import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export type TraceAvailabilityMap = Record<number, true>;

const fetchTraceAvailability = bulkIdsFetcher<true>('trace-availability');

/**
 * Bulk presence lookup: which of the given `benchmark_results.id`s have a
 * stored trace_replay blob. Used by the scatter chart to decide whether to
 * surface the "View charts" button — cheap boolean per id instead of
 * shipping multi-MB profile blobs just for the check.
 */
export function useTraceAvailability(ids: number[], enabled = true) {
  return useBulkIdsQuery('trace-availability', ids, enabled, fetchTraceAvailability);
}
