import { afterAll, describe, expect, it, mock, vi } from 'bun:test';

import * as nextCache from 'next/cache';

import { loadFixture } from '@/lib/testing/test-fixtures';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import {
  OPENROUTER_MODEL_IDS,
  type OpenRouterModelsPayload,
  openRouterPrices,
} from './openrouter-pricing';

mock.module('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: true }));
// Next's data cache needs the Next runtime; run the loader directly.
mock.module('next/cache', () => ({ ...nextCache, unstable_cache: (fn: unknown) => fn }));

const mockFetch = vi.fn();
stubGlobal('fetch', mockFetch);
afterAll(unstubAllGlobals);

// Imported after the mocks: the module reads FIXTURES_MODE and wraps its loader at load time.
const { fetchOpenRouterPricing, getOpenRouterPricing, openRouterPricingCacheKey } =
  await import('./openrouter-pricing.server');

describe('OpenRouter pricing in fixture mode', () => {
  it('serves the Cypress fixture prices without any network request', async () => {
    const pricing = await getOpenRouterPricing();
    expect(pricing).toEqual({
      fetchedAt: '2026-11-23T00:00:00.000Z',
      models: openRouterPrices(loadFixture<OpenRouterModelsPayload>('openrouter-models')),
    });
    expect(Object.keys(pricing.models)).toContain('deepseek/deepseek-v4-pro-0813');
    // The views API reads the same prices.
    await expect(fetchOpenRouterPricing('deepseek/deepseek-v4-pro-0813')).resolves.toMatchObject({
      source: 'openrouter',
      openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('openRouterPricingCacheKey', () => {
  it('changes with the catalog OpenRouter ID list, so a catalog edit gets a fresh entry', () => {
    const current = openRouterPricingCacheKey();
    expect(current).toEqual(openRouterPricingCacheKey(OPENROUTER_MODEL_IDS));
    expect(current[0]).toBe('openrouter-pricing-v1');
    expect(current[1]).toMatch(/^[0-9a-f]{12}$/u);
    expect(openRouterPricingCacheKey([...OPENROUTER_MODEL_IDS, 'new/model'])).not.toEqual(current);
    expect(openRouterPricingCacheKey(OPENROUTER_MODEL_IDS.slice(1))).not.toEqual(current);
  });
});
