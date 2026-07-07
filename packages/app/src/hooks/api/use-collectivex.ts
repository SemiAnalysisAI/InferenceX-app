import { useQuery } from '@tanstack/react-query';

import { fetchCollectiveX, fetchCollectiveXRun, fetchCollectiveXRunList } from '@/lib/api';
import type { CollectiveXChannelName } from '@/components/collectivex/reader';
import {
  COLLECTIVEX_DEFAULT_VERSION,
  type CollectiveXVersion,
} from '@/components/collectivex/types';

export function useCollectiveX(
  channel: CollectiveXChannelName = 'dev-latest',
  version: CollectiveXVersion = COLLECTIVEX_DEFAULT_VERSION,
) {
  return useQuery({
    queryKey: ['collectivex', version, channel],
    queryFn: ({ signal }) => fetchCollectiveX(channel, signal, version),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * JIT list of eligible ("tagged + success") publication runs for a version,
 * backing the run picker. `enabled` gates the fetch so the list is only pulled
 * when the user asks for it (the "Load runs" button); refetched on mount so a
 * reopened picker reflects newly autopublished runs without a hard reload.
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
 * Resolve one selected run's promoted dataset by digest. `enabled` gates the
 * fetch so the picker only loads a run once the user selects a non-default one;
 * the default view keeps using the dev-latest channel via {@link useCollectiveX}.
 */
export function useCollectiveXRun(version: CollectiveXVersion, digest: string | null) {
  return useQuery({
    queryKey: ['collectivex-run', version, digest],
    queryFn: ({ signal }) => fetchCollectiveXRun(version, digest!, signal),
    enabled: digest !== null,
    staleTime: Infinity,
  });
}
