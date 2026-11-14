import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api/api';

export interface BenchmarkHistoryOptions {
  benchmarkType?: 'agentic_traces';
  view?: 'calculator';
  enabled?: boolean;
}

export function benchmarkHistoryQueryOptions(
  model: string,
  isl: number,
  osl: number,
  options?: BenchmarkHistoryOptions,
) {
  const { benchmarkType, view } = options ?? {};
  return {
    queryKey: [
      'benchmark-history',
      model,
      isl,
      osl,
      benchmarkType ?? 'fixed',
      view ?? 'full',
    ] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchBenchmarkHistory(model, isl, osl, signal, benchmarkType, view),
    enabled:
      Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))) &&
      (options?.enabled ?? true),
  };
}

export function useBenchmarkHistory(
  model: string,
  isl: number,
  osl: number,
  options?: BenchmarkHistoryOptions,
) {
  return useQuery(benchmarkHistoryQueryOptions(model, isl, osl, options));
}
