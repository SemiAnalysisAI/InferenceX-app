import { useQuery } from '@tanstack/react-query';

import { fetchBenchmarkHistory } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useBenchmarkHistory(model: string, isl: number, osl: number) {
  return useQuery({
    queryKey: ['benchmark-history', model, isl, osl],
    queryFn: () => fetchBenchmarkHistory(model, isl, osl),
    enabled: Boolean(model && isl && osl),
    persister: idbPersister,
  });
}
