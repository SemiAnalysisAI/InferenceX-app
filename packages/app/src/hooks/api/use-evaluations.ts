import { useQuery } from '@tanstack/react-query';

import { expandEvalRows } from '@/components/evaluation/compact-rows';
import { fetchDashboardEvaluations } from '@/lib/api/api';

export function useEvaluations() {
  return useQuery({
    queryKey: ['evaluations'],
    queryFn: async ({ signal }) => expandEvalRows(await fetchDashboardEvaluations(signal)),
  });
}
