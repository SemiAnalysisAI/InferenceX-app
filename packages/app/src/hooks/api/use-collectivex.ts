import { useQuery } from '@tanstack/react-query';

import { fetchCollectiveX } from '@/lib/api';
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
