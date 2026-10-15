import { useQueries, useQuery } from '@tanstack/react-query';

import { fetchCollectiveXRun, fetchCollectiveXRunList } from '@/lib/api/api';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

/** Run summaries for a version: the deployment's build-time snapshot run. */
export function useCollectiveXRuns(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex-runs', version],
    queryFn: ({ signal }) => fetchCollectiveXRunList(version, signal),
  });
}

/** Resolve every checked run in parallel for the multi-run explorer. */
export function useCollectiveXRunDatasets(version: CollectiveXVersion, runIds: readonly string[]) {
  return useQueries({
    queries: runIds.map((runId) => ({
      queryKey: ['collectivex-run', version, runId],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCollectiveXRun(version, runId, signal),
    })),
  });
}
