// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';

const useQueryMock = vi.hoisted(() => vi.fn((options: unknown) => options));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: useQueryMock,
}));

import { useByIdQuery } from './benchmark-id-query';

const decode = (value: { encoded: number }) => ({ decoded: value.encoded });

interface ByIdOptions {
  queryKey: readonly unknown[];
  queryFn: (context: {
    signal: AbortSignal;
    client: { getQueryData: (key: readonly unknown[]) => unknown };
    queryKey: readonly unknown[];
  }) => Promise<unknown>;
  staleTime: number;
  refetchOnWindowFocus?: boolean;
  structuralSharing?: (previous: unknown, next: unknown) => unknown;
}

function byIdOptions(revalidate: boolean): ByIdOptions {
  function Harness() {
    useByIdQuery('gpu-metrics-point', 7, true, undefined, revalidate);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Harness)));
  act(() => root.unmount());
  return useQueryMock.mock.calls.at(-1)![0] as ByIdOptions;
}

function jsonResponse(body: unknown, etag: string): Response {
  return Response.json(body, { headers: { ETag: etag } });
}

function CaptionHarness({ caption: _caption }: { caption: string }) {
  useByIdQuery('request-chart-data', 439331, true, decode);
  return null;
}

describe('useByIdQuery', () => {
  beforeEach(() => useQueryMock.mockClear());

  it('keeps the nullable select wrapper stable across parent renders', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(CaptionHarness, { caption: 'first' })));
    const firstSelect = useQueryMock.mock.calls.at(-1)?.[0].select;

    act(() => root.render(createElement(CaptionHarness, { caption: 'second' })));
    const secondSelect = useQueryMock.mock.calls.at(-1)?.[0].select;

    expect(secondSelect).toBe(firstSelect);
    expect(secondSelect({ encoded: 42 })).toEqual({ decoded: 42 });
    expect(secondSelect(null)).toBeNull();

    act(() => root.unmount());
  });
});

describe('useByIdQuery revalidation', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const signal = new AbortController().signal;
  let cached: unknown;
  const client = { getQueryData: () => cached };

  beforeEach(() => {
    useQueryMock.mockClear();
    fetchMock.mockReset();
    cached = undefined;
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('revalidates on every mount and focus and reuses the cached payload on a 304', async () => {
    const options = byIdOptions(true);
    const run = async () => {
      const next = await options.queryFn({ signal, client, queryKey: options.queryKey });
      cached = options.structuralSharing!(cached, next);
      return cached;
    };
    expect(options.staleTime).toBe(0);
    expect(options.refetchOnWindowFocus).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }, '"a"'));
    const first = await run();
    expect(first).toEqual({ v: 1 });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/gpu-metrics-point?id=7', { signal });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    expect(await run()).toBe(first);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/gpu-metrics-point?id=7', {
      signal,
      headers: { 'If-None-Match': '"a"' },
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ v: 2 }, '"b"'));
    expect(await run()).toEqual({ v: 2 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ v: 2 }, '"c"'));
    const unchanged = cached;
    expect(await run()).toBe(unchanged);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    expect(await run()).toBe(unchanged);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/gpu-metrics-point?id=7', {
      signal,
      headers: { 'If-None-Match': '"c"' },
    });
  });

  it('keeps unconditional five-minute reuse for other by-id queries', async () => {
    const options = byIdOptions(false);
    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(options.refetchOnWindowFocus).toBeUndefined();
    expect(options.structuralSharing).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }, '"a"'));
    cached = await options.queryFn({ signal, client, queryKey: options.queryKey });
    fetchMock.mockResolvedValueOnce(jsonResponse({ v: 1 }, '"a"'));
    await options.queryFn({ signal, client, queryKey: options.queryKey });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/gpu-metrics-point?id=7', { signal });
  });
});
