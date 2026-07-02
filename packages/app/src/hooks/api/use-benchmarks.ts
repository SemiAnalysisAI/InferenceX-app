import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarks } from '@/lib/api';

/** Shared query options — reused by useQueries for comparison dates. */
export function benchmarkQueryOptions(
  model: string,
  date: string,
  enabled = true,
  exact?: boolean,
  /** GitHub run id for the "as of run" view (main chart) or the exact-run comparison. */
  runId?: string,
  /** When true with a runId, fetch exactly that run's results (GPU comparison). */
  exactRun?: boolean,
) {
  return {
    queryKey: [
      'benchmarks',
      model,
      date,
      exact ? 'exact' : 'latest',
      runId ?? 'all',
      exactRun ? 'run' : 'asof',
    ] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchBenchmarks(model, date, exact, signal, runId, exactRun),
    enabled: enabled && Boolean(model),
  };
}

export function useBenchmarks(
  model: string,
  date?: string,
  enabled = true,
  runId?: string,
  exactRun?: boolean,
) {
  return useQuery(
    benchmarkQueryOptions(model, date ?? 'latest', enabled, undefined, runId, exactRun),
  );
}
