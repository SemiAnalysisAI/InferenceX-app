import { useQuery } from '@tanstack/react-query';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { fetchTrendHistory } from '@/lib/api/api';
import { withSupplementalBenchmarkHistory } from '@/lib/benchmarks/supplemental-benchmarks';

export function useTrendHistory(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', 'trends'],
    queryFn: async ({ signal }) =>
      withSupplementalBenchmarkHistory(
        expandTrendHistory(await fetchTrendHistory(model, isl, osl, signal, benchmarkType)),
        { model, isl, osl, benchmarkType },
      ),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  });
}
