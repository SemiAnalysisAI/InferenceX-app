import { unstable_cache } from 'next/cache';

import { FIXTURES_MODE } from '@semianalysisai/inferencex-db/connection';

import type { TokenRevenuePricing } from '@/components/inference/types';
import { loadFixture } from '@/lib/testing/test-fixtures';

import {
  type OpenRouterModelsPayload,
  type OpenRouterPricingResponse,
  openRouterPrices,
  openRouterPricingForModel,
} from './openrouter-pricing';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** OpenRouter's own CDN caches the list for 120 s; prices rarely change faster than this. */
export const OPENROUTER_PRICING_REVALIDATE_SECONDS = 300;

const OPENROUTER_TIMEOUT_MS = 15_000;

/** Fixture builds read this instead of OpenRouter, so they make no outside request. */
const FIXTURE_FETCHED_AT = '2026-11-23T00:00:00.000Z';

/** Reads the full OpenRouter list (about 1 MB) and keeps only the catalog's prices. */
export async function readOpenRouterPricing(): Promise<OpenRouterPricingResponse> {
  if (FIXTURES_MODE) {
    return {
      fetchedAt: FIXTURE_FETCHED_AT,
      models: openRouterPrices(loadFixture<OpenRouterModelsPayload>('openrouter-models')),
    };
  }
  const response = await fetch(OPENROUTER_MODELS_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenRouter pricing request failed (${response.status})`);
  return {
    fetchedAt: new Date().toISOString(),
    models: openRouterPrices((await response.json()) as OpenRouterModelsPayload),
  };
}

/** The catalog's OpenRouter prices, shared by the pricing route and the views API. Failures are not cached. */
export const getOpenRouterPricing = unstable_cache(
  readOpenRouterPricing,
  ['openrouter-pricing-v1'],
  {
    revalidate: OPENROUTER_PRICING_REVALIDATE_SECONDS,
  },
);

/** One model's OpenRouter pricing; throws when the request fails or OpenRouter has no price. */
export async function fetchOpenRouterPricing(modelId: string): Promise<TokenRevenuePricing> {
  const { models } = await getOpenRouterPricing();
  const pricing = openRouterPricingForModel(models, modelId);
  if (!pricing) throw new Error(`OpenRouter pricing is unavailable for ${modelId}`);
  return pricing;
}
