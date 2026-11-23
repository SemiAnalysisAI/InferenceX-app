import { afterAll, beforeEach, describe, expect, it, vi } from 'bun:test';

import { stubGlobal, unstubAllGlobals } from '@/test/helpers';
import { ExpectedQueryFailureError } from '@/lib/analytics/query-error-analytics';
import { ApiRequestError } from '@/lib/api/api-request-error';
import type { OpenRouterPricingResponse } from '@/lib/calculator/openrouter-pricing';

import { fetchOpenRouterPricing } from './use-openrouter-pricing';

const mockFetch = vi.fn();
stubGlobal('fetch', mockFetch);
afterAll(unstubAllGlobals);
beforeEach(() => mockFetch.mockReset());

const V4_PRO = 'deepseek/deepseek-v4-pro-0813';
const PRICES: OpenRouterPricingResponse = {
  fetchedAt: '2026-11-23T00:00:00.000Z',
  models: {
    [V4_PRO]: { inputPerMillion: 1.2, outputPerMillion: 3.6, cachedInputPerMillion: null },
  },
};

describe('fetchOpenRouterPricing (browser)', () => {
  it('reads the same-origin pricing route, not openrouter.ai', async () => {
    mockFetch.mockResolvedValueOnce(Response.json(PRICES));
    const signal = new AbortController().signal;
    await expect(fetchOpenRouterPricing(V4_PRO, signal)).resolves.toMatchObject({
      source: 'openrouter',
      inputPerMillion: 1.2,
      outputPerMillion: 3.6,
      openRouterModelId: V4_PRO,
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/openrouter-pricing', { signal });
  });

  it('treats a model OpenRouter does not price as an expected, unreported outcome', async () => {
    mockFetch.mockResolvedValueOnce(Response.json(PRICES));
    const failure = fetchOpenRouterPricing('moonshotai/kimi-k3');
    await expect(failure).rejects.toBeInstanceOf(ExpectedQueryFailureError);
    await expect(failure).rejects.toThrow(
      'OpenRouter pricing is unavailable for moonshotai/kimi-k3',
    );
  });

  it('reports a failed pricing route with its status', async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ error: 'x' }, { status: 502 }));
    const failure = fetchOpenRouterPricing(V4_PRO);
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({
      status: 502,
      endpoint: '/api/v1/openrouter-pricing',
      message: 'OpenRouter pricing request failed (502)',
    });
  });
});
