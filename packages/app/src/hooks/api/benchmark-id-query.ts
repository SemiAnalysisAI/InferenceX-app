import { useCallback } from 'react';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiRequestError } from '@/lib/api/api-request-error';

const STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Fetch a bulk `?ids=` endpoint in parallel requests of at most
 * `maxIdsPerRequest` ids (the route's own limit) and merge the maps.
 */
export function bulkIdsFetcher<T>(
  endpoint: string,
  maxIdsPerRequest: number,
): (ids: number[], signal?: AbortSignal) => Promise<Record<number, T>> {
  return async (ids, signal) => {
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += maxIdsPerRequest) {
      chunks.push(ids.slice(i, i + maxIdsPerRequest));
    }
    const maps = await Promise.all(
      chunks.map(async (chunk) => {
        const url = `/api/v1/${endpoint}?ids=${chunk.join(',')}`;
        const res = await fetch(url, { signal });
        if (!res.ok) throw new ApiRequestError(`${endpoint} ${res.status}`, res.status, url);
        return (await res.json()) as Record<number, T>;
      }),
    );
    return Object.assign({}, ...maps) as Record<number, T>;
  };
}

/**
 * When each id in a bulk result was actually fetched. A lookup that reuses
 * cached ids gets a new `dataUpdatedAt`, so freshness is tracked per id to keep
 * reuse within `STALE_TIME_MS` of the original fetch.
 */
const fetchedAtById = new WeakMap<object, Map<number, number>>();

interface KnownResult<T> {
  value: T | undefined;
  fetchedAt: number;
}

/**
 * Per-id results of fresh queries already cached for `endpoint`. An id that
 * was requested but is missing from its map is known to have no entry.
 */
function knownBulkResults<T>(
  queryClient: QueryClient,
  endpoint: string,
): Map<number, KnownResult<T>> {
  const known = new Map<number, KnownResult<T>>();
  const freshSince = Date.now() - STALE_TIME_MS;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: [endpoint] })) {
    const data = query.state.data as Record<number, T> | undefined;
    const ids = query.queryKey[1];
    if (!data || typeof ids !== 'string') continue;
    const fetchedAt = fetchedAtById.get(data);
    for (const idText of ids.split(',')) {
      const id = Number(idText);
      const idFetchedAt = fetchedAt?.get(id) ?? query.state.dataUpdatedAt;
      if (idFetchedAt < freshSince) continue;
      const previous = known.get(id);
      if (!previous || previous.fetchedAt < idFetchedAt) {
        known.set(id, { value: data[id], fetchedAt: idFetchedAt });
      }
    }
  }
  return known;
}

/**
 * Query options for a bulk id lookup. The chart's visible id set changes as
 * filters settle, so only ids that no fresh cached lookup covered are fetched.
 */
export function bulkIdsQueryOptions<T>(
  queryClient: QueryClient,
  endpoint: string,
  ids: number[],
  enabled: boolean,
  fetchByIds: (ids: number[], signal?: AbortSignal) => Promise<Record<number, T>>,
) {
  const sortedKey = [...new Set(ids)].toSorted((a, b) => a - b);
  return {
    queryKey: [endpoint, sortedKey.join(',')] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Record<number, T>> => {
      const known = knownBulkResults<T>(queryClient, endpoint);
      const missing = sortedKey.filter((id) => !known.has(id));
      const fetched = missing.length > 0 ? await fetchByIds(missing, signal) : {};
      const now = Date.now();
      const result: Record<number, T> = {};
      const fetchedAt = new Map<number, number>();
      for (const id of sortedKey) {
        const reused = Object.hasOwn(fetched, id) ? undefined : known.get(id);
        const value = reused ? reused.value : fetched[id];
        fetchedAt.set(id, reused?.fetchedAt ?? now);
        if (value !== undefined) result[id] = value;
      }
      fetchedAtById.set(result, fetchedAt);
      return result;
    },
    enabled: enabled && sortedKey.length > 0,
    staleTime: STALE_TIME_MS,
  };
}

export function useBulkIdsQuery<T>(
  endpoint: string,
  ids: number[],
  enabled: boolean,
  fetchByIds: (ids: number[], signal?: AbortSignal) => Promise<Record<number, T>>,
) {
  return useQuery(bulkIdsQueryOptions(useQueryClient(), endpoint, ids, enabled, fetchByIds));
}

export function useByIdQuery<T, TSelected = T>(
  endpoint: string,
  id: number | null,
  enabled: boolean,
  select?: (data: T) => TSelected,
  freshness?: { staleTime: number; refetchOnWindowFocus: boolean },
) {
  const selectNullable = useCallback(
    (data: T | null): TSelected | null =>
      data === null ? null : (select?.(data) ?? (data as unknown as TSelected)),
    [select],
  );

  return useQuery({
    queryKey: [endpoint, id] as const,
    queryFn: async ({ signal }): Promise<T | null> => {
      if (!id) return null;
      const url = `/api/v1/${endpoint}?id=${id}`;
      const res = await fetch(url, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new ApiRequestError(`${endpoint} ${res.status}`, res.status, url);
      return (await res.json()) as T;
    },
    enabled,
    staleTime: STALE_TIME_MS,
    ...freshness,
    select: selectNullable,
  });
}
