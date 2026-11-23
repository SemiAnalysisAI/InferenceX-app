import { afterAll, beforeEach, describe, expect, it, mock, vi } from 'bun:test';

import * as nextCache from 'next/cache';

import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

// Next's data cache needs the Next runtime; run the loader directly.
mock.module('next/cache', () => ({
  ...nextCache,
  unstable_cache: (fn: unknown) => fn,
}));

const mockFetch = vi.fn();
stubGlobal('fetch', mockFetch);

const { GET } = await import('./route');

const request = () => new Request('http://localhost/api/v1/github-stars');

beforeEach(() => mockFetch.mockReset());
afterAll(unstubAllGlobals);

describe('GET /api/v1/github-stars', () => {
  it('serves the star count with the server token, CDN-cached for an hour', async () => {
    const previous = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
    mockFetch.mockResolvedValueOnce(Response.json({ stargazers_count: 2081, name: 'InferenceX' }));
    try {
      const res = await GET(request());
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      );
      expect(await res.json()).toEqual({ stars: 2081 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/SemiAnalysisAI/InferenceX',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token test-token',
          }),
          cache: 'no-store',
        }),
      );
    } finally {
      if (previous === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous;
    }
  });

  it.each([
    [
      'GitHub rate limits the request',
      () => mockFetch.mockResolvedValueOnce(new Response('{}', { status: 403 })),
    ],
    ['GitHub is unreachable', () => mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))],
    ['the response has no count', () => mockFetch.mockResolvedValueOnce(Response.json({}))],
  ])('answers an uncached 502 when %s', async (_label, arrange) => {
    arrange();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(request());
    error.mockRestore();
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
