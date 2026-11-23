import { useQuery } from '@tanstack/react-query';

import type { TokenRevenuePricing } from '@/components/inference/types';
import { ExpectedQueryFailureError } from '@/lib/analytics/query-error-analytics';
import { ApiRequestError } from '@/lib/api/api-request-error';
import {
  OPENROUTER_PRICING_PATH,
  type OpenRouterPricingResponse,
  openRouterPricingForModel,
} from '@/lib/calculator/openrouter-pricing';

/**
 * Reads one model's OpenRouter price from the same-origin pricing route. A model OpenRouter does
 * not price is an expected outcome the page explains, so it is not reported as a failed query.
 */
export async function fetchOpenRouterPricing(
  modelId: string,
  signal?: AbortSignal,
): Promise<TokenRevenuePricing> {
  const response = await fetch(OPENROUTER_PRICING_PATH, { signal });
  if (!response.ok) {
    throw new ApiRequestError(
      `OpenRouter pricing request failed (${response.status})`,
      response.status,
      OPENROUTER_PRICING_PATH,
    );
  }
  const { models } = (await response.json()) as OpenRouterPricingResponse;
  const pricing = openRouterPricingForModel(models, modelId);
  if (!pricing) {
    throw new ExpectedQueryFailureError(`OpenRouter pricing is unavailable for ${modelId}`);
  }
  return pricing;
}

export function useOpenRouterPricing(modelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['openrouter-pricing', modelId],
    queryFn: ({ signal }) => fetchOpenRouterPricing(modelId!, signal),
    enabled: enabled && Boolean(modelId),
    staleTime: 5 * 60 * 1_000,
    gcTime: 60 * 60 * 1_000,
    retry: (failureCount, error) =>
      !(error instanceof ExpectedQueryFailureError) && failureCount < 1,
  });
}
