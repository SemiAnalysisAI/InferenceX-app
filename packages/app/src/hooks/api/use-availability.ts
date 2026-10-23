import { useQuery } from '@tanstack/react-query';

import { fetchAvailability } from '@/lib/api/api';
import { withSupplementalAvailability } from '@/lib/benchmarks/supplemental-benchmarks';

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: async ({ signal }) => withSupplementalAvailability(await fetchAvailability(signal)),
  });
}
