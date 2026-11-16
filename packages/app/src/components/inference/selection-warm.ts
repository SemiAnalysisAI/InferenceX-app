import type { QueryClient } from '@tanstack/react-query';

import { sequenceTrendHistoryQueryOptions } from '@/hooks/api/use-trend-history';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';
import type { BenchmarkRow, WorkflowInfoResponse } from '@/lib/api/api';
import {
  buildRunInfo,
  type FilterPreview,
  resolveEffectiveRunId,
} from '@/providers/GlobalFilterContext';

import { chartBenchmarkQueryDate } from './hooks/chart-data-core';
import { chartBenchmarkQueries } from './hooks/useChartData';
import { resolveBenchmarkSeed } from './utils/benchmark-seed';
import { resolveChartRuns } from './utils/chart-runs';

type PrefetchOptions = Parameters<QueryClient['prefetchQuery']>[0] & { enabled?: boolean };

function prefetchEnabled(queryClient: QueryClient, options: PrefetchOptions): void {
  if (options.enabled !== false) void queryClient.prefetchQuery(options);
}

/** The `InferenceProvider` props that shape its queries. */
export interface InferenceChartPage {
  activeTab: string;
  isActive: boolean;
  scope?: string;
  seedRows?: BenchmarkRow[];
  seedModel?: string;
  seedSequence?: string;
}

/**
 * Warms the queries an `InferenceProvider` chart runs once `preview` applies. Run picks depend on
 * the date's workflow info. Until it loads the chart reads rows without them, so those keys are
 * warmed first and the run keys follow once it arrives.
 */
export function warmInferenceSelection(
  queryClient: QueryClient,
  { request, selection }: FilterPreview,
  page: InferenceChartPage,
): void {
  if (!page.isActive) return;
  const { model } = request;
  if (page.activeTab === 'historical') {
    prefetchEnabled(
      queryClient,
      sequenceTrendHistoryQueryOptions(model, selection.effectiveSequence),
    );
  }
  const seed = resolveBenchmarkSeed({
    scope: page.scope,
    seedRows: page.seedRows,
    seedModel: page.seedModel,
    seedSequence: page.seedSequence,
    selectedModel: model,
    selectedSequence: selection.effectiveSequence,
  });

  const warmRuns = (workflow: WorkflowInfoResponse | undefined) => {
    const availableRuns = workflow ? buildRunInfo(workflow) : {};
    const runs = resolveChartRuns(
      availableRuns,
      resolveEffectiveRunId(request.requestedRunId, availableRuns),
      model,
      selection.effectivePrecisions,
    );
    const queries = chartBenchmarkQueries({
      model,
      queryDate: chartBenchmarkQueryDate(
        selection.effectiveRunDate,
        selection.availableDates.at(-1),
        runs.asOfRunId,
      ),
      asOfRunId: runs.asOfRunId,
      runId: runs.benchmarkRunId,
      enabled: selection.sequenceResolved,
      prefetchLatestRows: !selection.sequenceResolved && !selection.effectiveRunDate && !seed.rows,
      scope: seed.scope,
      initialRows: seed.rows,
    });
    prefetchEnabled(queryClient, queries.base);
    prefetchEnabled(queryClient, queries.latest);
    prefetchEnabled(queryClient, queries.run);
  };

  const workflowQuery = workflowInfoQueryOptions(selection.effectiveRunDate);
  const cached = queryClient.getQueryData<WorkflowInfoResponse>(workflowQuery.queryKey);
  warmRuns(cached);
  if (cached === undefined && workflowQuery.enabled) {
    void queryClient.ensureQueryData(workflowQuery).then(warmRuns, () => {});
  }
}
