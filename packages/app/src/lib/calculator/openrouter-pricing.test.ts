import { describe, expect, it } from 'bun:test';

import { getOpenRouterModelId, Model } from '@/lib/catalog/data-mappings';

import {
  OPENROUTER_MODEL_IDS,
  openRouterPrices,
  openRouterPricingForModel,
} from './openrouter-pricing';

const V4_PRO = 'deepseek/deepseek-v4-pro-0813';

describe('OPENROUTER_MODEL_IDS', () => {
  it('lists each catalog OpenRouter mapping once', () => {
    expect(OPENROUTER_MODEL_IDS).toContain(getOpenRouterModelId(Model.DeepSeek_V4_Pro)!);
    expect(new Set(OPENROUTER_MODEL_IDS).size).toBe(OPENROUTER_MODEL_IDS.length);
  });
});

describe('openRouterPrices', () => {
  it('converts per-token strings to $/M token prices for catalog models only', () => {
    const prices = openRouterPrices({
      data: [
        {
          id: V4_PRO,
          pricing: {
            prompt: '0.000001122',
            completion: '0.000003366',
            input_cache_read: '0.00000008',
          },
        },
        { id: 'someone/else', pricing: { prompt: '0.000001', completion: '0.000002' } },
      ],
    });
    expect(Object.keys(prices)).toEqual([V4_PRO]);
    expect(prices[V4_PRO]!.inputPerMillion).toBeCloseTo(1.122, 10);
    expect(prices[V4_PRO]!.outputPerMillion).toBeCloseTo(3.366, 10);
    expect(prices[V4_PRO]!.cachedInputPerMillion).toBeCloseTo(0.08, 10);
  });

  it('drops a model without both prices and keeps a missing cache price as null', () => {
    expect(
      openRouterPrices(
        {
          data: [
            { id: 'a/incomplete', pricing: { prompt: '0.1' } },
            { id: 'a/negative', pricing: { prompt: '-1', completion: '0.1' } },
            { id: 'a/complete', pricing: { prompt: 0.000001, completion: '0.000002' } },
          ],
        },
        ['a/incomplete', 'a/negative', 'a/complete'],
      ),
    ).toEqual({
      'a/complete': { inputPerMillion: 1, outputPerMillion: 2, cachedInputPerMillion: null },
    });
    expect(openRouterPrices({})).toEqual({});
  });
});

describe('openRouterPricingForModel', () => {
  it('uses the published cache-read price when there is one', () => {
    expect(
      openRouterPricingForModel(
        { [V4_PRO]: { inputPerMillion: 1.2, outputPerMillion: 3.6, cachedInputPerMillion: 0.08 } },
        V4_PRO,
      ),
    ).toEqual({
      source: 'openrouter',
      inputPerMillion: 1.2,
      cachedInputPerMillion: 0.08,
      outputPerMillion: 3.6,
      openRouterModelId: V4_PRO,
    });
  });

  it('derives the cached-input price from the default ratio when none is published', () => {
    const pricing = openRouterPricingForModel(
      {
        [V4_PRO]: { inputPerMillion: 1.122, outputPerMillion: 3.366, cachedInputPerMillion: null },
      },
      V4_PRO,
    );
    expect(pricing?.cachedInputPerMillion).toBeCloseTo(0.1122, 10);
  });

  it('returns null for an unpriced model, including inherited property names', () => {
    expect(openRouterPricingForModel({}, 'missing/model')).toBeNull();
    expect(openRouterPricingForModel({}, 'constructor')).toBeNull();
  });
});
