import { scenarioToIslOsl } from '@semianalysisai/inferencex-constants';
import { useQuery } from '@tanstack/react-query';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { fetchTrendHistory } from '@/lib/api/api';
import { Scenario } from '@/lib/catalog/data-mappings';

export function trendHistoryQueryOptions(
  model: string,
  isl: number,
  osl: number,
  benchmarkType?: 'agentic_traces',
) {
  return {
    queryKey: ['benchmark-history', model, isl, osl, benchmarkType ?? 'fixed', 'trends'] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      expandTrendHistory(await fetchTrendHistory(model, isl, osl, signal, benchmarkType)),
    enabled: Boolean(model && (benchmarkType === 'agentic_traces' || (isl && osl))),
  };
}

/** The trend history of `model` on `sequence`, as the Historical Trends chart requests it. */
export function scenarioTrendHistoryQueryOptions(model: string, scenario: Scenario) {
  const islOsl = scenarioToIslOsl(scenario);
  return trendHistoryQueryOptions(
    model,
    islOsl?.isl ?? 0,
    islOsl?.osl ?? 0,
    scenario === Scenario.AgenticTraces ? 'agentic_traces' : undefined,
  );
}

export function useTrendHistory(model: string, scenario: Scenario) {
  return useQuery(scenarioTrendHistoryQueryOptions(model, scenario));
}
