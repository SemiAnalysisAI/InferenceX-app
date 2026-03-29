import { useQuery } from '@tanstack/react-query';

import { fetchFrameworkReleases } from '@/lib/api';

export function useFrameworkReleases() {
  return useQuery({
    queryKey: ['framework-releases'],
    queryFn: fetchFrameworkReleases,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
