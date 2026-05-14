import { useQuery } from '@tanstack/react-query';

import { fetchRunEnvironment, type RunEnvironmentResponse } from '@/lib/api';

/**
 * Fetch the environment metadata for a single benchmark row, keyed by the
 * natural `(workflow_run_id, config_id)` pair that also keys the
 * `benchmark_environments` table.
 *
 * Disabled when either id is missing (e.g. synthetic overlay or
 * unofficial-run points) — the drawer then renders point-derived fallbacks
 * and an inline "(not recorded)" for env-only fields.
 */
export function useRunEnvironment(workflowRunId: number | undefined, configId: number | undefined) {
  const enabled =
    typeof workflowRunId === 'number' &&
    Number.isFinite(workflowRunId) &&
    typeof configId === 'number' &&
    Number.isFinite(configId);
  return useQuery<RunEnvironmentResponse>({
    queryKey: ['run-environment', workflowRunId, configId] as const,
    queryFn: ({ signal }) =>
      fetchRunEnvironment(workflowRunId as number, configId as number, signal),
    enabled,
    // Env data for a given (run, config) never changes once written —
    // long stale time avoids refetches on drawer reopen.
    staleTime: 60 * 60 * 1000,
  });
}
