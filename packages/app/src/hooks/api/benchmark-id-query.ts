import { useQuery } from '@tanstack/react-query';

/**
 * Shared React Query plumbing for the agentic endpoints keyed by
 * `benchmark_results.id` (`/api/v1/<endpoint>?ids=…` bulk maps and
 * `/api/v1/<endpoint>?id=N` single lookups).
 *
 * Conventions kept identical across all of these hooks:
 *  - queryKey = [endpoint, sorted-deduped-ids-comma-joined] so any
 *    permutation of the same id set hits the same cache entry
 *  - staleTime = 5 minutes (the underlying blobs are immutable per run)
 *  - bulk queries disabled for empty id sets; single queries 404 → null
 */

const STALE_TIME_MS = 5 * 60 * 1000;

/** Build the standard bulk fetcher: GET `/api/v1/<endpoint>?ids=…` → map. */
export function bulkIdsFetcher<T>(
  endpoint: string,
): (ids: number[], signal?: AbortSignal) => Promise<Record<number, T>> {
  return async (ids, signal) => {
    if (ids.length === 0) return {};
    const res = await fetch(`/api/v1/${endpoint}?ids=${ids.join(',')}`, { signal });
    if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
    return (await res.json()) as Record<number, T>;
  };
}

/** Bulk map query over a set of benchmark_results ids. */
export function useBulkIdsQuery<T>(
  endpoint: string,
  ids: number[],
  enabled: boolean,
  fetchByIds: (ids: number[], signal?: AbortSignal) => Promise<T>,
) {
  const sortedKey = [...new Set(ids)].toSorted((a, b) => a - b);
  return useQuery({
    queryKey: [endpoint, sortedKey.join(',')] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchByIds(sortedKey, signal),
    enabled: enabled && sortedKey.length > 0,
    staleTime: STALE_TIME_MS,
  });
}

/** Single-payload query for one benchmark_results id; 404 resolves to null. */
export function useByIdQuery<T>(endpoint: string, id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [endpoint, id] as const,
    queryFn: async ({ signal }): Promise<T | null> => {
      if (!id) return null;
      const res = await fetch(`/api/v1/${endpoint}?id=${id}`, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
      return (await res.json()) as T;
    },
    enabled,
    staleTime: STALE_TIME_MS,
  });
}
