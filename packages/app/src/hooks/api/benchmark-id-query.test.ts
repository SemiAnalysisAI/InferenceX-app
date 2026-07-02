import { afterEach, describe, expect, it, vi } from 'vitest';

import { bulkIdsFetcher } from './benchmark-id-query';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bulkIdsFetcher', () => {
  it('returns an empty map without fetching for an empty id set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await bulkIdsFetcher<true>('trace-availability')([]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the endpoint with comma-joined ids and returns the parsed map', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ 1: true, 3: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await bulkIdsFetcher<true>('trace-availability')([1, 3]);
    expect(result).toEqual({ 1: true, 3: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/trace-availability?ids=1,3', {
      signal: undefined,
    });
  });

  it('throws with the endpoint name and status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));

    await expect(bulkIdsFetcher<true>('trace-histograms')([1])).rejects.toThrow(
      'trace-histograms 500',
    );
  });
});
