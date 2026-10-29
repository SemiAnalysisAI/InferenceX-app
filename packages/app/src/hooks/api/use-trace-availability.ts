import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export type TraceAvailabilityMap = Record<number, true>;

const fetchTraceAvailability = bulkIdsFetcher<true>('trace-availability', 500);

export function useTraceAvailability(ids: number[], enabled = true) {
  return useBulkIdsQuery('trace-availability', ids, enabled, fetchTraceAvailability);
}
