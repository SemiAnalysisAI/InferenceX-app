import { bulkIdsFetcher, useBulkIdsQuery } from './benchmark-id-query';

export type LogAvailabilityMap = Record<number, true>;

const fetchLogAvailability = bulkIdsFetcher<true>('log-availability');

/** Bulk presence lookup for DB-backed benchmark points with a stored server log. */
export function useLogAvailability(ids: number[], enabled = true) {
  return useBulkIdsQuery('log-availability', ids, enabled, fetchLogAvailability);
}
