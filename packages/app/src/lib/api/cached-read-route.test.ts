import { describe, expect, it, vi, mock } from 'bun:test';

mock.module('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: true }));
mock.module('../cache/api-cache', () => ({
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
  cachedQuery: (fetch: () => Promise<unknown>) => fetch,
}));

import { cachedReadRoute } from './cached-read-route';

describe('cachedReadRoute fixture mode', () => {
  it('serves the fixture without calling the database reader', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('database must not be read'));
    const GET = cachedReadRoute({
      cacheKey: 'fixture-contract',
      fetch,
      fixture: () => ({ source: 'fixture' }),
      logLabel: 'fixture contract',
    });

    const response = await GET(new Request('https://example.test/api/v1/example'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source: 'fixture' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
