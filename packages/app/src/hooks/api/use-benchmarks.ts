import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarks } from '@/lib/api';

/** Shared query options — reused by useQueries for comparison dates. */
export function benchmarkQueryOptions(
  model: string,
  date: string,
  enabled = true,
  exact?: boolean,
) {
  return {
    queryKey: ['benchmarks', model, date, exact ? 'exact' : 'latest'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchBenchmarks(model, date, exact, signal),
    enabled: enabled && Boolean(model),
  };
}

export function useBenchmarks(model: string, date?: string, enabled = true) {
  return useQuery(benchmarkQueryOptions(model, date ?? 'latest', enabled));
}
