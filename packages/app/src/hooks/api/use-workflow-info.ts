import { useQuery } from '@tanstack/react-query';

import { fetchWorkflowInfo } from '@/lib/api';

export function workflowInfoQueryOptions(
  date: string,
  benchmarkType?: 'agentic_traces',
  enabled = true,
) {
  return {
    queryKey: benchmarkType
      ? (['workflow-info', date, benchmarkType] as const)
      : (['workflow-info', date] as const),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchWorkflowInfo(date, signal, benchmarkType),
    enabled: enabled && Boolean(date),
  };
}

export function useWorkflowInfo(date: string) {
  return useQuery(workflowInfoQueryOptions(date));
}
