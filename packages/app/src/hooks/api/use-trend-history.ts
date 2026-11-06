import { useQuery } from '@tanstack/react-query';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { fetchTrendHistory } from '@/lib/api/api';

export function useTrendHistory(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', 'trends'],
    queryFn: async ({ signal }) =>
      expandTrendHistory(await fetchTrendHistory(model, isl, osl, signal, benchmarkType)),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  });
}
