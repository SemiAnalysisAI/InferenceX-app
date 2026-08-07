import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api';

export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType],
    queryFn: ({ signal }) => fetchBenchmarkHistory(model, isl, osl, benchmarkType, signal),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  });
}
