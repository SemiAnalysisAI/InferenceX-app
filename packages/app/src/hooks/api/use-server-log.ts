import { useInfiniteQuery } from '@tanstack/react-query';

export const SERVER_LOG_CHUNK_SIZE = 64 * 1024;
const STALE_TIME_MS = 5 * 60 * 1000;

export interface ServerLogChunk {
  id: number;
  fileName: string;
  serverLog: string;
  offset: number;
  nextOffset: number | null;
}

async function fetchServerLogChunk(
  id: number,
  fileName: string,
  offset: number,
  signal?: AbortSignal,
): Promise<ServerLogChunk | null> {
  const params = new URLSearchParams({
    id: String(id),
    file: fileName,
    offset: String(offset),
    limit: String(SERVER_LOG_CHUNK_SIZE),
  });
  const response = await fetch(`/api/v1/server-log?${params}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`server-log ${response.status}`);
  return (await response.json()) as ServerLogChunk;
}

/** Incrementally fetch immutable server-log chunks for one benchmark point. */
export function useServerLog(id: number | null, fileName: string | null, enabled = false) {
  return useInfiniteQuery({
    queryKey: ['server-log', id, fileName, 'chunks'] as const,
    queryFn: ({ pageParam, signal }) => {
      if (!id || !fileName) return Promise.resolve(null);
      return fetchServerLogChunk(id, fileName, pageParam, signal);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage?.nextOffset ?? undefined,
    enabled: enabled && Boolean(id) && Boolean(fileName),
    staleTime: STALE_TIME_MS,
  });
}
