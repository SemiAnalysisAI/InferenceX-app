import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarks, type BenchmarkRow } from '@/lib/api/api';
import { withSupplementalBenchmarks } from '@/lib/benchmarks/supplemental-benchmarks';

export function benchmarkQueryOptions(
  model: string,
  date: string,
  enabled = true,
  exact?: boolean,
  runId?: string,
  exactRun?: boolean,
  view?: { type: 'calculator'; sequence: string; cacheScope?: string },
  initialData?: BenchmarkRow[],
  scope?: string,
  keepPreviousForModel?: boolean,
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
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      withSupplementalBenchmarks(
        await fetchBenchmarks(model, canonicalDate, exact, signal, runId, exactRun, view),
        { model, date: canonicalDate, exact, runId, view },
      ),
    enabled: enabled && Boolean(model),
    ...(initialData ? { initialData } : {}),
    ...(keepPreviousForModel
      ? {
          placeholderData: (
            previousData: BenchmarkRow[] | undefined,
            previousQuery: { queryKey: readonly unknown[] } | undefined,
          ) => (previousQuery?.queryKey[1] === model ? previousData : undefined),
        }
      : {}),
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
  keepPreviousForModel?: boolean,
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
      keepPreviousForModel,
    ),
  );
}
