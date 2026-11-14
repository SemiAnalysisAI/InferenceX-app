import { useQuery } from '@tanstack/react-query';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { fetchTrendHistory } from '@/lib/api/api';

export function trendHistoryQueryOptions(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return {
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', 'trends'] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      expandTrendHistory(await fetchTrendHistory(model, isl, osl, signal, benchmarkType)),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  };
}

export function useTrendHistory(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return useQuery(trendHistoryQueryOptions(model, isl, osl, benchmarkType));
}
