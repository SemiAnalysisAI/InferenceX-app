import { useQuery } from '@tanstack/react-query';

import { ApiRequestError } from '@/lib/api/api-request-error';

export interface ServerLogSearchMatch {
  fileName: string;
  offset: number;
  before: string;
  match: string;
  after: string;
}

export interface ServerLogSearchResponse {
  id: number;
  query: string;
  matches: ServerLogSearchMatch[];
  truncated: boolean;
}

async function fetchServerLogSearch(
  id: number,
  query: string,
  signal?: AbortSignal,
): Promise<ServerLogSearchResponse> {
  const params = new URLSearchParams({ id: String(id), q: query });
  const url = `/api/v1/server-log-search?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new ApiRequestError(`server-log-search ${response.status}`, response.status, url);
  }
  return (await response.json()) as ServerLogSearchResponse;
}

export function useServerLogSearch(id: number, query: string, enabled = false) {
  return useQuery({
    queryKey: ['server-log-search', id, query] as const,
    queryFn: ({ signal }) => fetchServerLogSearch(id, query, signal),
    enabled: enabled && query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
