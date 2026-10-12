import { useQuery } from '@tanstack/react-query';

import { fetchEvaluations } from '@/lib/api/api';

export function useEvaluations() {
  return useQuery({
    queryKey: ['evaluations'],
    queryFn: ({ signal }) => fetchEvaluations(signal),
  });
}
