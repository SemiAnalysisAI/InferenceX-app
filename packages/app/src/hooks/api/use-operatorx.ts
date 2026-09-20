import { useQuery } from '@tanstack/react-query';
import type {
  OperatorXDataset,
  OperatorXRunSummary,
} from '@semianalysisai/inferencex-db/operatorx/reader';
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OperatorX request failed (${response.status})`);
  return response.json();
}
export function useOperatorXRuns() {
  return useQuery({
    queryKey: ['operatorx-runs'],
    queryFn: ({ signal }) =>
      get<{ runs: OperatorXRunSummary[]; discovery_complete: boolean }>(
        '/api/v1/operatorx/runs',
        signal,
      ),
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.discovery_complete === false ? 2000 : false),
  });
}
export function useOperatorXRun(runId: string) {
  return useQuery({
    queryKey: ['operatorx-run', runId],
    queryFn: ({ signal }) => get<OperatorXDataset>(`/api/v1/operatorx/runs/${runId}`, signal),
    enabled: Boolean(runId),
    staleTime: 60_000,
  });
}
