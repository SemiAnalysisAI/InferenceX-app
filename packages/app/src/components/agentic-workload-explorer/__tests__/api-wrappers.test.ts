import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextRequest } from 'next/server';

import {
  ANON_ONLY_VISIBILITY,
  CDN_CACHE_CONTROL,
  withExplorerRoute,
} from '@/lib/agentic-workload-explorer/api';

function makeRequest(): NextRequest {
  return {
    method: 'GET',
    headers: new Headers(),
    url: 'http://localhost:3000/api/v1/agentic-workload-explorer/test',
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('withExplorerRoute', () => {
  it('always hands the handler the anonymized-only visibility filter', async () => {
    const handler = vi.fn(() => Promise.resolve({ ok: true }));
    await withExplorerRoute(handler)(makeRequest());
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ vis: ANON_ONLY_VISIBILITY }));
    // A non-null filter is what restricts DB helpers to privacy_mode = 'anon'.
    expect(ANON_ONLY_VISIBILITY).not.toBeNull();
  });

  it('resolves route params for the handler', async () => {
    const handler = vi.fn(() => Promise.resolve({}));
    await withExplorerRoute(handler)(makeRequest(), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'abc' } }));
  });

  it('camelCases data and marks success responses CDN-cacheable', async () => {
    const res = await withExplorerRoute(() => Promise.resolve({ request_count: 3 }))(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CDN_CACHE_CONTROL);
    await expect(res.json()).resolves.toEqual({ requestCount: 3 });
  });

  it('passes Response results through untouched', async () => {
    const notFound = Response.json({ error: 'Not found' }, { status: 404 });
    const res = await withExplorerRoute(() => Promise.resolve(notFound))(makeRequest());
    expect(res).toBe(notFound);
  });

  it('returns an uncached 500 when the handler throws', async () => {
    const res = await withExplorerRoute(() => Promise.reject(new Error('boom')))(makeRequest());
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('retries replica recovery conflicts (40001) and then succeeds', async () => {
    vi.useFakeTimers();
    const conflict = Object.assign(new Error('conflict with recovery'), { code: '40001' });
    const flaky = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({ data: 'ok' });
    const pending = withExplorerRoute(flaky)(makeRequest());
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    const res = await withExplorerRoute(failing)(makeRequest());
    expect(res.status).toBe(500);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
