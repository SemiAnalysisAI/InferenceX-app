import { useQuery } from '@tanstack/react-query';

import { fetchEvaluations } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useEvaluations() {
  return useQuery({
    queryKey: ['evaluations'],
    queryFn: fetchEvaluations,
    persister: idbPersister,
  });
}
