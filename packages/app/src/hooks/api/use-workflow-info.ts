import { useQuery } from '@tanstack/react-query';

import { fetchWorkflowInfo } from '@/lib/api';
import { idbPersister } from '@/lib/indexdb-cache';

export function useWorkflowInfo(date: string) {
  return useQuery({
    queryKey: ['workflow-info', date],
    queryFn: () => fetchWorkflowInfo(date),
    enabled: Boolean(date),
    persister: idbPersister,
  });
}
