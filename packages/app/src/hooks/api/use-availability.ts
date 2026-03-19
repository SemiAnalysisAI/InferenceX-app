import { useQuery } from '@tanstack/react-query';

import { fetchAvailability } from '@/lib/api';

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: fetchAvailability,
  });
}
