import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteCollectiveXRun,
  fetchCollectiveX,
  fetchCollectiveXRun,
  fetchCollectiveXRunList,
} from '@/lib/api';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

/** Latest ingested run's neutral dataset — the default page view. */
export function useCollectiveX(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex', version],
    queryFn: ({ signal }) => fetchCollectiveX(signal, version),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Every ingested run summary for a version, backing the always-visible run
 * table. Refetched on mount so the table reflects newly ingested runs without
 * a hard reload.
 */
export function useCollectiveXRuns(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex-runs', version],
    queryFn: ({ signal }) => fetchCollectiveXRunList(version, signal),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Resolve one selected run's neutral dataset by run_id. Kept as the focused
 * single-run hook for callers that do not need the multi-run table.
 */
export function useCollectiveXRun(version: CollectiveXVersion, runId: string | null) {
  return useQuery({
    queryKey: ['collectivex-run', version, runId],
    queryFn: ({ signal }) => fetchCollectiveXRun(version, runId!, signal),
    enabled: runId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/** Resolve every checked run in parallel for the multi-run explorer. */
export function useCollectiveXRunDatasets(version: CollectiveXVersion, runIds: readonly string[]) {
  return useQueries({
    queries: runIds.map((runId) => ({
      queryKey: ['collectivex-run', version, runId],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCollectiveXRun(version, runId, signal),
      staleTime: 0,
      refetchOnMount: 'always' as const,
    })),
  });
}

/**
 * Admin deletion of an ingested run. Resolves `false` on 401 (stale token —
 * the caller clears its stored copy); on success every CollectiveX query is
 * invalidated so the latest view and run table drop the run immediately.
 */
export function useDeleteCollectiveXRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, token }: { runId: string; token: string }) =>
      deleteCollectiveXRun(runId, token),
    onSuccess: (deleted) => {
      if (!deleted) return;
      for (const key of ['collectivex', 'collectivex-runs', 'collectivex-run']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
