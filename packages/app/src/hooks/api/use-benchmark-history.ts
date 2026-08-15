import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api';

export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return useQuery({
    queryKey: benchmarkType
      ? ['benchmark-history', model, isl, osl, benchmarkType]
      : ['benchmark-history', model, isl, osl],
    queryFn: ({ signal }) => fetchBenchmarkHistory(model, isl, osl, signal, benchmarkType),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  });
}
