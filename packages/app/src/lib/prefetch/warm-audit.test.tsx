// @vitest-environment jsdom
import {
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppQueryClient, QueryProvider } from '@/providers/query-provider';

import { auditWarmedQueries, WARM_AUDIT_DELAY_MS } from './warm-audit';

const KEY = ['benchmarks', 'warm-audit'];
const options = { queryKey: KEY, queryFn: () => Promise.resolve(1) };

function Reader() {
  useQuery(options);
  return null;
}

describe('auditWarmedQueries', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let root: Root | undefined;
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    client = createAppQueryClient();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    client.clear();
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('warns once with the key when a warmed query is never observed', async () => {
    const stop = auditWarmedQueries(client);
    await client.prefetchQuery(options);

    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS - 1);
    expect(warn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS * 2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('warmed but never read'), KEY);
    stop();
  });

  it('stays quiet when a useQuery observer reads the warmed key in time', async () => {
    const stop = auditWarmedQueries(client);
    await client.prefetchQuery(options);
    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS / 2);

    root = createRoot(document.createElement('div'));
    act(() =>
      root!.render(
        <QueryClientProvider client={client}>
          <Reader />
        </QueryClientProvider>,
      ),
    );

    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS * 2);
    expect(warn).not.toHaveBeenCalled();
    stop();
  });

  it('cancels pending timers when the query is removed or the audit stops', async () => {
    const stop = auditWarmedQueries(client);
    await client.prefetchQuery(options);
    await client.prefetchQuery({ ...options, queryKey: ['other'] });
    client.removeQueries({ queryKey: KEY });
    stop();

    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS * 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('adds no subscription or timers in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const subscribe = vi.spyOn(client.getQueryCache(), 'subscribe');

    const stop = auditWarmedQueries(client);
    await client.prefetchQuery(options);

    expect(subscribe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it('is wired into QueryProvider and unsubscribes on unmount', async () => {
    let providedClient: QueryClient | undefined;
    function Capture() {
      providedClient = useQueryClient();
      return null;
    }

    root = createRoot(document.createElement('div'));
    act(() =>
      root!.render(
        <QueryProvider>
          <Capture />
        </QueryProvider>,
      ),
    );
    await providedClient!.prefetchQuery(options);
    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS);
    expect(warn).toHaveBeenCalledTimes(1);

    await providedClient!.prefetchQuery({ ...options, queryKey: ['after-unmount'] });
    act(() => root!.unmount());
    root = undefined;
    await vi.advanceTimersByTimeAsync(WARM_AUDIT_DELAY_MS);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
