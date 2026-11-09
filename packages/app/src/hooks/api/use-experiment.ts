'use client';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { useQuery } from '@tanstack/react-query';
import {
  isExperimentCampaign,
  type ExperimentResponse,
} from '@/lib/benchmarks/experiment-benchmarks';

export function useExperimentCampaign(): string | null {
  const value = useClientSearchParams().get('experiment');
  return isExperimentCampaign(value) ? value : null;
}
export function useExperimentSelected(): boolean {
  return useExperimentCampaign() !== null;
}

export function useExperiment(enabled = true) {
  const campaign = useExperimentCampaign();
  const selected = campaign !== null && enabled;
  const query = useQuery({
    queryKey: ['experiment', campaign],
    queryFn: async ({ signal }): Promise<ExperimentResponse> => {
      const response = await fetch(`/api/v1/experiments/${encodeURIComponent(campaign!)}`, {
        signal,
      });
      if (!response.ok) throw new Error(`Experiment data unavailable (${response.status})`);
      return response.json();
    },
    enabled: selected,
    staleTime: Infinity,
    select: selected ? (data: ExperimentResponse) => data : () => undefined,
  });
  return { ...query, selected };
}
