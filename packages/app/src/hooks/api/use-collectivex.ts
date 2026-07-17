import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
 * Ingested runs for a version, backing the run picker. `enabled` gates the
 * fetch so the list is only pulled when the user opens the picker; refetched on
 * mount so a reopened picker reflects newly ingested runs without a hard reload.
 */
export function useCollectiveXRuns(
  version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION,
  enabled = true,
) {
  return useQuery({
    queryKey: ['collectivex-runs', version],
    queryFn: ({ signal }) => fetchCollectiveXRunList(version, signal),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Resolve one selected run's neutral dataset by run_id. `enabled` gates the fetch
 * so the picker only loads a run once the user selects a non-default one; the
 * default view keeps using the latest run via {@link useCollectiveX}.
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

/**
 * Admin deletion of an ingested run. Resolves `false` on 401 (stale token —
 * the caller clears its stored copy); on success every CollectiveX query is
 * invalidated so the latest view and picker drop the run immediately.
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
