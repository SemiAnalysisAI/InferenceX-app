import { useQuery } from '@tanstack/react-query';

import { fetchAvailability } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: fetchAvailability,
    persister: idbPersister,
  });
}
