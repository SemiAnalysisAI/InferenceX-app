import type { TokenRevenuePricing } from '@/components/inference/types';
import { getOpenRouterModelId, Model } from '@/lib/catalog/data-mappings';

import { DEFAULT_CACHED_INPUT_PRICE_RATIO } from './cache-pricing';

/** Same-origin, CDN-cached OpenRouter prices for the catalog's models (`page-bff` route). */
export const OPENROUTER_PRICING_PATH = '/api/v1/openrouter-pricing';

/** One model's OpenRouter list price in dollars per million tokens. */
export interface OpenRouterPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** The published cache-read price, or null when OpenRouter lists none. */
  cachedInputPerMillion: number | null;
}

export interface OpenRouterPricingResponse {
  /** When the server read OpenRouter's model list (ISO 8601). */
  fetchedAt: string;
  /** Keyed by OpenRouter model ID. Holds only catalog models that have prompt and completion prices. */
  models: Record<string, OpenRouterPrice>;
}

/** Every OpenRouter model ID the catalog maps a model to, sorted. */
export const OPENROUTER_MODEL_IDS: readonly string[] = [
  ...new Set(
    Object.values(Model)
      .map(getOpenRouterModelId)
      .filter((id) => id !== null),
  ),
].toSorted();

/** The parts of `https://openrouter.ai/api/v1/models` this reads; prices are dollars per token. */
export interface OpenRouterModelsPayload {
  data?: {
    id?: unknown;
    pricing?: { prompt?: unknown; completion?: unknown; input_cache_read?: unknown };
  }[];
}

function dollarsPerMillion(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : null;
}

/** Converts OpenRouter's model list to the prices of `modelIds`, dropping models without both prices. */
export function openRouterPrices(
  payload: OpenRouterModelsPayload,
  modelIds: readonly string[] = OPENROUTER_MODEL_IDS,
): Record<string, OpenRouterPrice> {
  const wanted = new Set(modelIds);
  const prices: Record<string, OpenRouterPrice> = {};
  for (const model of payload.data ?? []) {
    if (typeof model.id !== 'string' || !wanted.has(model.id)) continue;
    const inputPerMillion = dollarsPerMillion(model.pricing?.prompt);
    const outputPerMillion = dollarsPerMillion(model.pricing?.completion);
    if (inputPerMillion === null || outputPerMillion === null) continue;
    prices[model.id] = {
      inputPerMillion,
      outputPerMillion,
      cachedInputPerMillion: dollarsPerMillion(model.pricing?.input_cache_read),
    };
  }
  return prices;
}

/** The token-revenue pricing for one model, or null when OpenRouter does not price it. */
export function openRouterPricingForModel(
  models: Readonly<Record<string, OpenRouterPrice>>,
  modelId: string,
): TokenRevenuePricing | null {
  const price = Object.hasOwn(models, modelId) ? models[modelId] : undefined;
  if (!price) return null;
  return {
    source: 'openrouter',
    inputPerMillion: price.inputPerMillion,
    cachedInputPerMillion:
      price.cachedInputPerMillion ?? price.inputPerMillion * DEFAULT_CACHED_INPUT_PRICE_RATIO,
    outputPerMillion: price.outputPerMillion,
    openRouterModelId: modelId,
  };
}
