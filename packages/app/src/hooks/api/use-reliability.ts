import { useQuery } from '@tanstack/react-query';

import { fetchReliability } from '@/lib/api';

export function useReliability() {
  return useQuery({
    queryKey: ['reliability'],
    queryFn: fetchReliability,
  });
}
