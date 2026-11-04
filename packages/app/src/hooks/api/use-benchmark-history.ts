import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api/api';
import { withSupplementalBenchmarkHistory } from '@/lib/benchmarks/supplemental-benchmarks';

export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  options?: {
    benchmarkType?: 'agentic_traces';
    view?: 'calculator';
    enabled?: boolean;
  },
) {
  const { benchmarkType, view } = options ?? {};
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', view ?? 'full'],
    queryFn: async ({ signal }) =>
      withSupplementalBenchmarkHistory(
        await fetchBenchmarkHistory(model, isl, osl, signal, benchmarkType, view),
        { model, isl, osl, benchmarkType },
      ),
    enabled:
      Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))) &&
      (options?.enabled ?? true),
  });
}
