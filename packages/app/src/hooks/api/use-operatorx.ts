import { useQuery } from '@tanstack/react-query';

import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import type { ComparisonOp, ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import type {
  OperatorXDataset,
  OperatorXResultDetail,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `OperatorX request failed (${response.status})`);
  return body as T;
}

export function useOperatorXRuns() {
  return useQuery({
    queryKey: ['operatorx', 'runs'],
    queryFn: ({ signal }) =>
      get<{ source: string; runs: OperatorXRunRef[] }>('/api/v1/operatorx/runs', signal),
    staleTime: 60_000,
  });
}

export function useOperatorXDataset(runId: string | null) {
  return useQuery({
    queryKey: ['operatorx', 'run', runId],
    queryFn: ({ signal }) => get<OperatorXDataset>(`/api/v1/operatorx/runs/${runId}`, signal),
    enabled: Boolean(runId),
    staleTime: 5 * 60_000,
  });
}

export function useOperatorXResult(runId: string | null, index: number | null) {
  return useQuery({
    queryKey: ['operatorx', 'result', runId, index],
    queryFn: ({ signal }) =>
      get<OperatorXResultDetail>(`/api/v1/operatorx/runs/${runId}/results/${index}`, signal),
    enabled: Boolean(runId) && index !== null,
    staleTime: 5 * 60_000,
  });
}

export function useOperatorXComparison(op: ComparisonOp | null, workload: string | null) {
  const params = new URLSearchParams({ op: op ?? '' });
  if (workload) params.set('workload', workload);
  return useQuery({
    queryKey: ['operatorx', 'compare', op, workload],
    queryFn: ({ signal }) => get<ComparisonView>(`/api/v1/operatorx/compare?${params}`, signal),
    enabled: op !== null,
    staleTime: 5 * 60_000,
    placeholderData: (previous) => (previous?.op === op ? previous : undefined),
  });
}
