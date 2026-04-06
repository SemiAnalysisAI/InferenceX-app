import { useQuery } from '@tanstack/react-query';

import { fetchSubmissions } from '@/lib/api';

export function useSubmissions() {
  return useQuery({
    queryKey: ['submissions'],
    queryFn: fetchSubmissions,
  });
}
