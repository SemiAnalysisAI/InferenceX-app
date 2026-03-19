import { useQuery } from '@tanstack/react-query';

import { fetchGitHubStars } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useGitHubStars() {
  return useQuery({
    queryKey: ['github-stars'],
    queryFn: fetchGitHubStars,
    staleTime: 60 * 60 * 1000, // 1 hour
    persister: idbPersister,
  });
}
