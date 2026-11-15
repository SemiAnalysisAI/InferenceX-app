import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { useQuery } from '@tanstack/react-query';

import { expandTrendHistory } from '@/components/inference/hooks/trend-history-rows';
import { fetchTrendHistory } from '@/lib/api/api';
import { Sequence } from '@/lib/catalog/data-mappings';

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
export function sequenceTrendHistoryQueryOptions(model: string, sequence: Sequence) {
  const islOsl = sequenceToIslOsl(sequence);
  return trendHistoryQueryOptions(
    model,
    islOsl?.isl ?? 0,
    islOsl?.osl ?? 0,
    sequence === Sequence.AgenticTraces ? 'agentic_traces' : undefined,
  );
}

export function useTrendHistory(model: string, sequence: Sequence) {
  return useQuery(sequenceTrendHistoryQueryOptions(model, sequence));
}
