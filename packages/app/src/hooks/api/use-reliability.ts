import { useQuery } from '@tanstack/react-query';

import { fetchReliabilityDaily } from '@/lib/api/api';

export function useReliability() {
  return useQuery({
    queryKey: ['reliability'],
    queryFn: ({ signal }) => fetchReliabilityDaily(signal),
  });
}
