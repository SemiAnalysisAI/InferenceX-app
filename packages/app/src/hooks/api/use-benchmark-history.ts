import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory, fetchTrendHistory } from '@/lib/api/api';
import { withSupplementalBenchmarkHistory } from '@/lib/benchmarks/supplemental-benchmarks';

export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  options?: {
    benchmarkType?: 'agentic_traces';
    /** `trends` loads only what Historical Trends reads (`/api/v1/benchmarks/history/trends`). */
    view?: 'calculator' | 'trends';
    enabled?: boolean;
  },
) {
  const { benchmarkType, view } = options ?? {};
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', view ?? 'full'],
    queryFn: async ({ signal }) =>
      withSupplementalBenchmarkHistory(
        await (view === 'trends'
          ? fetchTrendHistory(model, isl, osl, signal, benchmarkType)
          : fetchBenchmarkHistory(model, isl, osl, signal, benchmarkType, view)),
        { model, isl, osl, benchmarkType },
      ),
    enabled:
      Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))) &&
      (options?.enabled ?? true),
  });
}
