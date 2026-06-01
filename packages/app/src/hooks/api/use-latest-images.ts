import { useQuery } from '@tanstack/react-query';

import { fetchLatestImages } from '@/lib/api';

export function useLatestImages() {
  return useQuery({
    queryKey: ['latest-images'],
    queryFn: fetchLatestImages,
  });
}
