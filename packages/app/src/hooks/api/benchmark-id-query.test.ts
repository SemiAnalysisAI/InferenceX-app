import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { bulkIdsFetcher, bulkIdsQueryOptions } from './benchmark-id-query';

afterEach(() => {
  vi.unstubAllGlobals();
});

const chunkOf = (url: string) =>
  new URL(url, 'https://example.test').searchParams.get('ids')!.split(',').map(Number);

describe('bulkIdsFetcher', () => {
  it('returns an empty map without fetching for an empty id set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await bulkIdsFetcher<true>('trace-availability', 500)([]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the endpoint with comma-joined ids and returns the parsed map', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ 1: true, 3: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await bulkIdsFetcher<true>('trace-availability', 500)([1, 3]);
    expect(result).toEqual({ 1: true, 3: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/trace-availability?ids=1,3', {
      signal: undefined,
    });
  });

  it('splits id sets above the route limit and merges every chunk', async () => {
    // /inference/deepseek-r1 asked for 535 ids in one request and got a 400.
    const ids = Array.from({ length: 535 }, (_, index) => index + 1);
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(Response.json({ [chunkOf(url).at(-1)!]: true })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await bulkIdsFetcher<true>('log-availability', 500)(ids);

    const chunks = fetchMock.mock.calls.map(([url]) => chunkOf(url));
    expect(chunks.map((chunk) => chunk.length)).toEqual([500, 35]);
    expect(chunks.flat()).toEqual(ids);
    expect(result).toEqual({ 500: true, 535: true });
  });

  it('sends exactly the limit in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);

    await bulkIdsFetcher<true>(
      'log-availability',
      500,
    )(Array.from({ length: 500 }, (_, index) => index + 1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws with the endpoint name and status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));

    await expect(bulkIdsFetcher<true>('trace-histograms', 200)([1])).rejects.toThrow(
      'trace-histograms 500',
    );
  });
});

function lookup(queryClient: QueryClient, ids: number[], fetchByIds: Mock) {
  return queryClient.fetchQuery(
    bulkIdsQueryOptions<true>(queryClient, 'log-availability', ids, true, fetchByIds),
  );
}

describe('bulkIdsQueryOptions', () => {
  it('keys the same id set identically regardless of order and duplicates', () => {
    const queryClient = new QueryClient();
    const key = (ids: number[]) =>
      bulkIdsQueryOptions(queryClient, 'log-availability', ids, true, vi.fn()).queryKey;

    expect(key([3, 1, 2, 3])).toEqual(key([1, 2, 3]));
  });

  it('fetches only ids that no fresh lookup covered, keeping known absences', async () => {
    const queryClient = new QueryClient();
    await lookup(queryClient, [1, 2, 3], vi.fn().mockResolvedValue({ 1: true, 3: true }));

    const fetchByIds = vi.fn().mockResolvedValue({ 4: true });
    const result = await lookup(queryClient, [2, 3, 4], fetchByIds);

    expect(fetchByIds).toHaveBeenCalledExactlyOnceWith([4], expect.anything());
    expect(result).toEqual({ 3: true, 4: true });
  });

  it('makes no request when earlier lookups cover every id', async () => {
    const queryClient = new QueryClient();
    await lookup(queryClient, [1, 2, 3], vi.fn().mockResolvedValue({ 2: true }));

    const fetchByIds = vi.fn();
    expect(await lookup(queryClient, [2, 3], fetchByIds)).toEqual({ 2: true });
    expect(fetchByIds).not.toHaveBeenCalled();
  });

  it('refetches ids whose cached lookup is stale', async () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      await lookup(queryClient, [1, 2], vi.fn().mockResolvedValue({ 1: true }));
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const fetchByIds = vi.fn().mockResolvedValue({ 2: true });
      expect(await lookup(queryClient, [1, 2, 5], fetchByIds)).toEqual({ 2: true });
      expect(fetchByIds).toHaveBeenCalledExactlyOnceWith([1, 2, 5], expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it('ages reused ids from their original fetch, not from the lookup that reused them', async () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      await lookup(queryClient, [1, 2], vi.fn().mockResolvedValue({ 1: true }));
      vi.advanceTimersByTime(4 * 60 * 1000);
      await lookup(queryClient, [1, 3], vi.fn().mockResolvedValue({ 3: true }));
      vi.advanceTimersByTime(2 * 60 * 1000);

      const fetchByIds = vi.fn().mockResolvedValue({ 1: true });
      expect(await lookup(queryClient, [1, 3, 4], fetchByIds)).toEqual({ 1: true, 3: true });
      expect(fetchByIds).toHaveBeenCalledExactlyOnceWith([1, 4], expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reuse results from another endpoint', async () => {
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(
      bulkIdsQueryOptions<true>(
        queryClient,
        'trace-availability',
        [1],
        true,
        vi.fn().mockResolvedValue({ 1: true }),
      ),
    );

    const fetchByIds = vi.fn().mockResolvedValue({});
    expect(await lookup(queryClient, [1], fetchByIds)).toEqual({});
    expect(fetchByIds).toHaveBeenCalledExactlyOnceWith([1], expect.anything());
  });
});
