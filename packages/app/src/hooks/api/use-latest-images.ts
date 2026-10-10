import { useQuery } from '@tanstack/react-query';

import { fetchLatestImages } from '@/lib/api/api';

export function useLatestImages() {
  return useQuery({
    queryKey: ['latest-images'],
    queryFn: ({ signal }) => fetchLatestImages(signal),
  });
}
