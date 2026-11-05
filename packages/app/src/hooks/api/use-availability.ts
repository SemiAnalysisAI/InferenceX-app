import { useQuery } from '@tanstack/react-query';

import { fetchDashboardAvailability } from '@/lib/api/api';
import { indexAvailability } from '@/lib/benchmarks/availability-index';

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: async ({ signal }) => indexAvailability(await fetchDashboardAvailability(signal)),
  });
}
