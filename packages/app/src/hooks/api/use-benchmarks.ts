import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarks, type BenchmarkRow } from '@/lib/api';

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
  view?: { type: 'calculator'; sequence: string; cacheScope?: string },
  initialData?: BenchmarkRow[],
  scope?: string,
) {
  const canonicalDate = date === 'latest' ? '' : date;
  return {
    queryKey: [
      'benchmarks',
      model,
      canonicalDate,
      exact ? 'exact' : 'latest',
      runId ?? 'all',
      exactRun ? 'run' : 'asof',
      ...(view
        ? ([view.type, view.sequence, ...(view.cacheScope ? [view.cacheScope] : [])] as const)
        : []),
      ...(scope ? (['scope', scope] as const) : []),
    ] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchBenchmarks(model, canonicalDate, exact, signal, runId, exactRun, view),
    enabled: enabled && Boolean(model),
    ...(initialData ? { initialData } : {}),
  };
}

export function useBenchmarks(
  model: string,
  date?: string,
  enabled = true,
  runId?: string,
  exactRun?: boolean,
  view?: { type: 'calculator'; sequence: string; cacheScope?: string },
  initialData?: BenchmarkRow[],
  scope?: string,
) {
  return useQuery(
    benchmarkQueryOptions(
      model,
      date ?? '',
      enabled,
      undefined,
      runId,
      exactRun,
      view,
      initialData,
      scope,
    ),
  );
}
