import { queryOptions, useQuery } from '@tanstack/react-query';

import { fetchDashboardAvailability } from '@/lib/api/api';
import { indexAvailability } from '@/lib/benchmarks/availability-index';

export function availabilityQueryOptions() {
  return queryOptions({
    queryKey: ['availability'],
    queryFn: async ({ signal }) => indexAvailability(await fetchDashboardAvailability(signal)),
  });
}

export function useAvailability() {
  return useQuery(availabilityQueryOptions());
}
