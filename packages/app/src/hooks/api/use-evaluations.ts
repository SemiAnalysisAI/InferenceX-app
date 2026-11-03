import { useQuery } from '@tanstack/react-query';

import { fetchDashboardEvaluations } from '@/lib/api/api';

export function useEvaluations() {
  return useQuery({
    queryKey: ['evaluations'],
    queryFn: ({ signal }) => fetchDashboardEvaluations(signal),
  });
}
