import { useQuery } from '@tanstack/react-query';

import { fetchWorkflowInfo } from '@/lib/api';

export function useWorkflowInfo(date: string) {
  return useQuery({
    queryKey: ['workflow-info', date],
    queryFn: ({ signal }) => fetchWorkflowInfo(date, signal),
    enabled: Boolean(date),
  });
}
