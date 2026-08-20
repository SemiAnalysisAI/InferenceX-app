import { useQuery } from '@tanstack/react-query';

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
  const response = await fetch(`/api/v1/server-log-search?${params}`, { signal });
  if (!response.ok) throw new Error(`server-log-search ${response.status}`);
  return (await response.json()) as ServerLogSearchResponse;
}

/** Search complete stored log files; the browser does not need to load them first. */
export function useServerLogSearch(id: number, query: string, enabled = false) {
  return useQuery({
    queryKey: ['server-log-search', id, query] as const,
    queryFn: ({ signal }) => fetchServerLogSearch(id, query, signal),
    enabled: enabled && query.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
