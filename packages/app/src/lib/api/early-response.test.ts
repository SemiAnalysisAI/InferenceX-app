import { afterEach, describe, expect, it, vi } from 'bun:test';

import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import { fetchBenchmarks, fetchDashboardAvailability } from './api';
import {
  EARLY_FETCH_MAX_AGE_MS,
  type EarlyFetchRegistry,
  takeEarlyResponse,
} from './early-response';

const AVAILABILITY = '/api/v1/availability/compact';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function installRegistry(entries: Record<string, Promise<Response>>, startedAt = 0) {
  const registry: EarlyFetchRegistry = {};
  for (const [url, response] of Object.entries(entries)) {
    response.catch(() => {});
    registry[url] = { startedAt, response };
  }
  stubGlobal('__infxEarlyFetch', registry);
  return registry;
}

afterEach(() => {
  unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('takeEarlyResponse', () => {
  it('returns undefined when the document started no requests', async () => {
    stubGlobal('__infxEarlyFetch', undefined);
    expect(await takeEarlyResponse(AVAILABILITY)).toBeUndefined();
  });

  it('hands a response over once', async () => {
    const response = json({ ok: 1 });
    const registry = installRegistry({ [AVAILABILITY]: Promise.resolve(response) });
    expect(await takeEarlyResponse(AVAILABILITY)).toBe(response);
    expect(registry[AVAILABILITY]).toBeUndefined();
    expect(await takeEarlyResponse(AVAILABILITY)).toBeUndefined();
  });

  it('matches the exact URL only', async () => {
    const registry = installRegistry({
      '/api/v1/benchmarks?model=DeepSeek-R1-0528': Promise.resolve(json([])),
    });
    expect(
      await takeEarlyResponse('/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-05-20'),
    ).toBeUndefined();
    expect(await takeEarlyResponse('/api/v1/benchmarks?model=Kimi-K3.1-Pro')).toBeUndefined();
    expect(registry['/api/v1/benchmarks?model=DeepSeek-R1-0528']).toBeDefined();
  });

  it('drops an entry older than the maximum age', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(EARLY_FETCH_MAX_AGE_MS + 1);
    const registry = installRegistry({ [AVAILABILITY]: Promise.resolve(json({})) }, 0);
    expect(await takeEarlyResponse(AVAILABILITY)).toBeUndefined();
    expect(registry[AVAILABILITY]).toBeUndefined();
  });

  it('keeps an entry exactly at the maximum age', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(EARLY_FETCH_MAX_AGE_MS);
    const response = json({});
    installRegistry({ [AVAILABILITY]: Promise.resolve(response) }, 0);
    expect(await takeEarlyResponse(AVAILABILITY)).toBe(response);
  });

  it('returns undefined for a failed request or an error status', async () => {
    installRegistry({
      [AVAILABILITY]: Promise.reject(new TypeError('Failed to fetch')),
      '/api/v1/reliability': Promise.resolve(json({ error: 'x' }, 503)),
    });
    expect(await takeEarlyResponse(AVAILABILITY)).toBeUndefined();
    expect(await takeEarlyResponse('/api/v1/reliability')).toBeUndefined();
  });

  it('rejects with the abort reason when already aborted, and still consumes the entry', async () => {
    const registry = installRegistry({ [AVAILABILITY]: Promise.resolve(json({})) });
    const controller = new AbortController();
    controller.abort(new DOMException('aborted', 'AbortError'));
    await expect(takeEarlyResponse(AVAILABILITY, controller.signal)).rejects.toThrow('aborted');
    expect(registry[AVAILABILITY]).toBeUndefined();
  });

  it('rejects with the abort reason when aborted while the response is in flight', async () => {
    const { promise } = Promise.withResolvers<Response>();
    installRegistry({ [AVAILABILITY]: promise });
    const controller = new AbortController();
    const taken = takeEarlyResponse(AVAILABILITY, controller.signal);
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await expect(taken).rejects.toThrow('cancelled');
  });
});

describe('fetchJson with early responses', () => {
  it('reads the early response without fetching', async () => {
    const fetchMock = vi.fn();
    stubGlobal('fetch', fetchMock);
    installRegistry({ [AVAILABILITY]: Promise.resolve(json({ models: ['m'] })) });
    expect(await fetchDashboardAvailability()).toEqual({ models: ['m'] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the URL itself when the early request failed', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json([{ id: 1 }])));
    stubGlobal('fetch', fetchMock);
    const url = '/api/v1/benchmarks?model=DeepSeek-R1-0528';
    installRegistry({ [url]: Promise.reject(new TypeError('Failed to fetch')) });
    expect(await fetchBenchmarks('DeepSeek-R1-0528')).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, { signal: undefined });
  });

  it('fetches again after the early response was consumed', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json({ fresh: true })));
    stubGlobal('fetch', fetchMock);
    installRegistry({ [AVAILABILITY]: Promise.resolve(json({ early: true })) });
    expect(await fetchDashboardAvailability()).toEqual({ early: true });
    expect(await fetchDashboardAvailability()).toEqual({ fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not read an early response for another URL', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json([{ dated: true }])));
    stubGlobal('fetch', fetchMock);
    installRegistry({
      '/api/v1/benchmarks?model=DeepSeek-R1-0528': Promise.resolve(json([{ latest: true }])),
    });
    expect(await fetchBenchmarks('DeepSeek-R1-0528', '2026-05-20')).toEqual([{ dated: true }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-05-20',
      {
        signal: undefined,
      },
    );
  });
});
