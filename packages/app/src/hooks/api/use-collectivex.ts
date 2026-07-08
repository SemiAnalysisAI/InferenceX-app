import { useQuery } from '@tanstack/react-query';

import { fetchCollectiveX, fetchCollectiveXRun, fetchCollectiveXRunList } from '@/lib/api';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

/** Latest sweep run's neutral dataset — the default page view. */
export function useCollectiveX(version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION) {
  return useQuery({
    queryKey: ['collectivex', version],
    queryFn: ({ signal }) => fetchCollectiveX(signal, version),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Recent sweep runs for a version, backing the run picker. `enabled` gates the
 * fetch so the list is only pulled when the user opens the picker; refetched on
 * mount so a reopened picker reflects newly finished runs without a hard reload.
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
    staleTime: Infinity,
  });
}
