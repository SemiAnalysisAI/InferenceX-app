import { afterAll, beforeEach, describe, expect, it, mock, vi } from 'bun:test';

import * as nextCache from 'next/cache';

import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

// Next's data cache needs the Next runtime; run the loader directly.
mock.module('next/cache', () => ({ ...nextCache, unstable_cache: (fn: unknown) => fn }));

const mockFetch = vi.fn();
stubGlobal('fetch', mockFetch);

// Imported after the mock: the server module wraps its loader in `unstable_cache` at load time.
const { fetchOpenRouterPricing } = await import('@/lib/calculator/openrouter-pricing.server');
const { GET } = await import('./route');

const V4_PRO = 'deepseek/deepseek-v4-pro-0813';

function openRouterList(status = 200): Response {
  return Response.json(
    {
      data: [
        {
          id: V4_PRO,
          name: 'A long description OpenRouter ships for every model',
          pricing: { prompt: '0.000001', completion: '0.000003', input_cache_read: '0.0000001' },
        },
        { id: 'unrelated/model', pricing: { prompt: '0.000001', completion: '0.000002' } },
      ],
    },
    { status },
  );
}

beforeEach(() => mockFetch.mockReset());
afterAll(unstubAllGlobals);

describe('GET /api/v1/openrouter-pricing', () => {
  it('serves only the catalog prices, CDN-cached for five minutes', async () => {
    mockFetch.mockResolvedValueOnce(openRouterList());
    const res = await GET(new Request('http://localhost/api/v1/openrouter-pricing'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    );
    const body = await res.json();
    expect(Object.keys(body.models)).toEqual([V4_PRO]);
    expect(body.models[V4_PRO]).toEqual({
      inputPerMillion: 1,
      outputPerMillion: 3,
      cachedInputPerMillion: expect.closeTo(0.1, 10),
    });
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  // A 200 without usable prices must fail before Next's data cache and the CDN keep it for minutes.
  it.each([
    [
      'OpenRouter answers with an error',
      () => mockFetch.mockResolvedValueOnce(openRouterList(503)),
      'OpenRouter pricing request failed (503)',
    ],
    [
      'OpenRouter is unreachable',
      () => mockFetch.mockRejectedValueOnce(new TypeError('fetch failed')),
      'fetch failed',
    ],
    [
      'OpenRouter returns an empty model list',
      () => mockFetch.mockResolvedValueOnce(Response.json({ data: [] })),
      'OpenRouter returned an empty model list',
    ],
    [
      'OpenRouter returns a non-array model list',
      () => mockFetch.mockResolvedValueOnce(Response.json({ data: { models: [] } })),
      'OpenRouter returned an empty model list',
    ],
    [
      'OpenRouter returns no model list',
      () => mockFetch.mockResolvedValueOnce(Response.json({})),
      'OpenRouter returned an empty model list',
    ],
    [
      'OpenRouter prices none of the catalog models',
      () =>
        mockFetch.mockResolvedValueOnce(
          Response.json({
            data: [
              { id: 'unrelated/model', pricing: { prompt: '0.000001', completion: '0.000002' } },
              { id: V4_PRO, pricing: { prompt: '0.000001' } },
            ],
          }),
        ),
      'OpenRouter returned no prices for the catalog models',
    ],
  ])('answers an uncached 502 when %s', async (_case, arrange, reason) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    arrange();
    const res = await GET(new Request('http://localhost/api/v1/openrouter-pricing'));
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'OpenRouter pricing is unavailable right now' });
    expect(logged).toHaveBeenCalledWith(
      'Error fetching OpenRouter pricing:',
      expect.objectContaining({ message: reason }),
    );
    logged.mockRestore();
  });
});

describe('fetchOpenRouterPricing (views API)', () => {
  it('prices a catalog model and throws for one OpenRouter does not price', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(openRouterList()));
    await expect(fetchOpenRouterPricing(V4_PRO)).resolves.toMatchObject({
      source: 'openrouter',
      inputPerMillion: 1,
      outputPerMillion: 3,
    });
    await expect(fetchOpenRouterPricing('moonshotai/kimi-k3')).rejects.toThrow(
      'OpenRouter pricing is unavailable for moonshotai/kimi-k3',
    );
  });
});
