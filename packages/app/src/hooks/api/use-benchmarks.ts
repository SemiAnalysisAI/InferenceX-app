import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { fetchBenchmarks } from '@/lib/api';

/** Shared query options — reused by useQueries for comparison dates. */
export function benchmarkQueryOptions(model: string, date: string, enabled: boolean = true) {
  return {
    queryKey: ['benchmarks', model, date] as const,
    queryFn: () => fetchBenchmarks(model, date),
    enabled: enabled && Boolean(model),
  };
}

export function useBenchmarks(model: string, date?: string, enabled: boolean = true) {
  return useQuery({
    ...benchmarkQueryOptions(model, date ?? 'latest', enabled),
    placeholderData: keepPreviousData,
  });
}
