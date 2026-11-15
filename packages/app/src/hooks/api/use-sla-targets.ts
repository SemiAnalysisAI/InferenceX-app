import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import type { SlaLatencyTargets } from '@semianalysisai/inferencex-constants';

import { fetchSlaEvaluations, fetchSlaTargets } from '@/lib/sla-targets/client';
import type { SlaPointEvaluations } from '@/lib/sla-targets/evaluation';

/** Ids sent per evaluation request; the route accepts at most this many. */
export const SLA_EVALUATION_BATCH = 64;

export function useSlaTargetsDataset(model: string | null) {
  return useQuery({
    queryKey: ['sla-targets', model],
    queryFn: ({ signal }) => fetchSlaTargets(model, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Server evaluations of load points against latency targets. `evaluations`
 * holds the points that have arrived for these exact targets; while new
 * targets load, the previous results are not shown as if they applied.
 */
export function useSlaEvaluations(ids: readonly number[], targets: SlaLatencyTargets) {
  const batches: number[][] = [];
  for (let start = 0; start < ids.length; start += SLA_EVALUATION_BATCH) {
    batches.push(ids.slice(start, start + SLA_EVALUATION_BATCH));
  }
  return useQueries({
    queries: batches.map((batch) => ({
      queryKey: [
        'sla-evaluations',
        batch.join(','),
        targets.maxTtftMs,
        targets.maxTpotMs,
        targets.maxE2eS,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSlaEvaluations(batch, targets, signal),
      staleTime: Number.POSITIVE_INFINITY,
    })),
    combine: (results) => ({
      evaluations: Object.assign(
        {},
        ...results.map((result) => result.data ?? {}),
      ) as SlaPointEvaluations,
      isLoading: results.some((result) => result.isLoading),
      error: results.find((result) => result.error)?.error ?? null,
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  });
}
