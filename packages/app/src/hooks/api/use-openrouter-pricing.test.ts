import { describe, expect, it } from 'vitest';

import { openRouterPricingForModel } from './use-openrouter-pricing';

describe('openRouterPricingForModel', () => {
  it('converts OpenRouter per-token strings to $/M token prices', () => {
    const pricing = openRouterPricingForModel(
      {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              completion: '0.000003366',
            },
          },
        ],
      },
      'deepseek/deepseek-v4-pro-0813',
    );

    expect(pricing).toMatchObject({
      source: 'openrouter',
      inputPerMillion: 1.122,
      outputPerMillion: 3.366,
      openRouterModelId: 'deepseek/deepseek-v4-pro-0813',
    });
    expect(pricing?.cachedInputPerMillion).toBeCloseTo(0.1122, 10);
  });

  it('uses a published cache-read price when OpenRouter provides one', () => {
    const pricing = openRouterPricingForModel(
      {
        data: [
          {
            id: 'deepseek/deepseek-v4-pro-0813',
            pricing: {
              prompt: '0.000001122',
              input_cache_read: '0.00000008',
              completion: '0.000003366',
            },
          },
        ],
      },
      'deepseek/deepseek-v4-pro-0813',
    );

    expect(pricing?.cachedInputPerMillion).toBe(0.08);
  });

  it('returns null for a missing model or incomplete prices', () => {
    expect(openRouterPricingForModel({ data: [] }, 'missing/model')).toBeNull();
    expect(
      openRouterPricingForModel(
        { data: [{ id: 'incomplete/model', pricing: { prompt: '0.1' } }] },
        'incomplete/model',
      ),
    ).toBeNull();
  });
});
