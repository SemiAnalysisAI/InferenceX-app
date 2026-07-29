import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteCollectiveXRun, fetchCollectiveXRun, fetchCollectiveXRunList } from '@/lib/api';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

/**
 * Every stored run summary for a version. While the server reports an
 * incomplete discovery pass, keep refetching the uncached endpoint so bounded
 * ingest batches progressively fill the table.
 */
export function useCollectiveXRuns(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex-runs', version],
    queryFn: ({ signal }) => fetchCollectiveXRunList(version, signal),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => (query.state.data?.discovery_complete === false ? 1_000 : false),
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
 * invalidated so the run table and selected datasets drop it immediately.
 */
export function useDeleteCollectiveXRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, token }: { runId: string; token: string }) =>
      deleteCollectiveXRun(runId, token),
    onSuccess: (deleted) => {
      if (!deleted) return;
      for (const key of ['collectivex-runs', 'collectivex-run']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
