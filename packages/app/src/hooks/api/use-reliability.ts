import { useQuery } from '@tanstack/react-query';

import { fetchReliability } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useReliability() {
  return useQuery({
    queryKey: ['reliability'],
    queryFn: fetchReliability,
    persister: idbPersister,
  });
}
