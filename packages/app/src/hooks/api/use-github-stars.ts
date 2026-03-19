import { useQuery } from '@tanstack/react-query';

import { fetchGitHubStars } from '@/lib/api';

export function useGitHubStars() {
  return useQuery({
    queryKey: ['github-stars'],
    queryFn: fetchGitHubStars,
  });
}
