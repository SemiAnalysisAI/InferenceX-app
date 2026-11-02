'use client';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { WEKA_EXPERIMENT, type ExperimentResponse } from '@/lib/benchmarks/experiment-benchmarks';

export function useExperimentSelected(): boolean {
  return useSearchParams()?.get('experiment') === WEKA_EXPERIMENT;
}

export function useExperiment(enabled = true) {
  const selected = useExperimentSelected();
  return useQuery({
    queryKey: ['experiment', WEKA_EXPERIMENT],
    queryFn: async ({ signal }): Promise<ExperimentResponse> => {
      const response = await fetch(`/api/v1/experiments/${WEKA_EXPERIMENT}`, { signal });
      if (!response.ok) throw new Error(`Experiment data unavailable (${response.status})`);
      return response.json();
    },
    enabled: selected && enabled,
    staleTime: Infinity,
    select: selected && enabled ? (data: ExperimentResponse) => data : () => undefined,
  });
}
