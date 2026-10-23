import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteCollectiveXRun, fetchCollectiveXRun, fetchCollectiveXRunList } from '@/lib/api/api';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

export function useCollectiveXRuns(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex-runs', version],
    queryFn: ({ signal }) => fetchCollectiveXRunList(version, signal),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: (query) => (query.state.data?.discovery_complete === false ? 1_000 : false),
  });
}

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
