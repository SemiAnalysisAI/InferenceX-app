import { queryOptions, useQuery } from '@tanstack/react-query';

import { expandEvalRows } from '@/components/evaluation/compact-rows';
import { fetchDashboardEvaluations } from '@/lib/api/api';

export function evaluationsQueryOptions() {
  return queryOptions({
    queryKey: ['evaluations'],
    queryFn: async ({ signal }) => expandEvalRows(await fetchDashboardEvaluations(signal)),
  });
}

export function useEvaluations() {
  return useQuery(evaluationsQueryOptions());
}
