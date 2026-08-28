import { useQuery } from '@tanstack/react-query';

import type { TokenRevenuePricing } from '@/components/inference/types';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

interface OpenRouterModel {
  id?: unknown;
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
  };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

function dollarsPerMillion(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : null;
}

/** Parse OpenRouter's per-token catalog prices into dashboard $/M tok units. */
export function openRouterPricingForModel(
  payload: OpenRouterModelsResponse,
  modelId: string,
): TokenRevenuePricing | null {
  const model = payload.data?.find((candidate) => candidate.id === modelId);
  const inputPerMillion = dollarsPerMillion(model?.pricing?.prompt);
  const outputPerMillion = dollarsPerMillion(model?.pricing?.completion);
  if (inputPerMillion === null || outputPerMillion === null) return null;

  return {
    source: 'openrouter',
    inputPerMillion,
    outputPerMillion,
    openRouterModelId: modelId,
  };
}

export async function fetchOpenRouterPricing(
  modelId: string,
  signal?: AbortSignal,
): Promise<TokenRevenuePricing> {
  const response = await fetch(OPENROUTER_MODELS_URL, { signal });
  if (!response.ok) throw new Error(`OpenRouter pricing request failed (${response.status})`);
  const pricing = openRouterPricingForModel(
    (await response.json()) as OpenRouterModelsResponse,
    modelId,
  );
  if (!pricing) throw new Error(`OpenRouter pricing is unavailable for ${modelId}`);
  return pricing;
}

/** Fetch the public OpenRouter model catalog only when its price source is active. */
export function useOpenRouterPricing(modelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['openrouter-pricing', modelId],
    queryFn: ({ signal }) => fetchOpenRouterPricing(modelId!, signal),
    enabled: enabled && Boolean(modelId),
    staleTime: 5 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    retry: 1,
  });
}
