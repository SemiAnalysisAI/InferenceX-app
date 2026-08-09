// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/client-navigation';
import type { OverviewPageData, OverviewTier } from '@/lib/overview-data';

/** One stable stub, not a fresh spy per render: a per-render spy makes
 *  `expect(push).not.toHaveBeenCalled()` unfalsifiable. */
const routerStub = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

import {
  OverviewNavigationProvider,
  useOverviewData,
  useOverviewNavigation,
  useOverviewReference,
} from './overview-navigation';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let selectTier: (() => void) | undefined;
let selectEngine: (() => void) | undefined;
let selectReference: (() => void) | undefined;
let prefetchTier: (() => void) | undefined;

function pageData(tier: OverviewTier): OverviewPageData {
  return {
    models: [],
    tier,
    engineScope: 'community',
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    historicalWindow: null,
  };
}

function Probe() {
  const navigation = useOverviewNavigation();
  const data = useOverviewData();
  const reference = useOverviewReference();
  selectTier = () => navigation.push('/overview?tier=75', ['tier']);
  selectEngine = () => navigation.push('/overview?engine=all', ['engine']);
  selectReference = () => navigation.push('/overview?ref=b300', ['ref']);
  prefetchTier = () => navigation.prefetch('/overview?tier=75', ['tier']);
  return (
    <>
      <output data-testid="tier">{data.tier}</output>
      <output data-testid="reference">{reference}</output>
      <output data-testid="pending">{navigation.isPending ? 'pending' : 'settled'}</output>
    </>
  );
}

function renderProvider(data: OverviewPageData, href: string) {
  act(() => {
    root.render(
      <OverviewNavigationProvider initialData={data} initialHref={href}>
        <Probe />
      </OverviewNavigationProvider>,
    );
  });
}

function readProbe(testId: string): string | undefined {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? undefined;
}

function deferredFetch() {
  const settlers: { resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
  const stub = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        settlers.push({ resolve, reject });
      }),
  );
  vi.stubGlobal('fetch', stub);
  return { stub, settlers };
}

beforeEach(() => {
  routerStub.push.mockClear();
  routerStub.replace.mockClear();
  window.history.replaceState({}, '', '/overview');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  selectTier = undefined;
  selectEngine = undefined;
  selectReference = undefined;
  prefetchTier = undefined;
  vi.unstubAllGlobals();
});

describe('OverviewNavigationProvider', () => {
  it('ignores an older selector response after fresh server props arrive', async () => {
    const { settlers } = deferredFetch();

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());

    expect(fetch).toHaveBeenCalledWith('/api/v1/overview?tier=75', {
      headers: { Accept: 'application/json' },
    });

    renderProvider(pageData(100), '/overview?tier=100');
    expect(readProbe('tier')).toBe('100');

    await act(async () => {
      settlers[0]?.resolve(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(readProbe('tier')).toBe('100');
  });

  it('does not write history or route after the provider unmounts', async () => {
    const { settlers } = deferredFetch();
    const replaceState = vi.spyOn(History.prototype, 'replaceState');

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());
    replaceState.mockClear();

    act(() => root.unmount());

    await act(async () => {
      settlers[0]?.reject(new Error('network down'));
      await Promise.resolve();
    });

    expect(routerStub.push).not.toHaveBeenCalled();
    expect(routerStub.replace).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    // The shared afterEach unmounts again; react-dom tolerates the repeat.
  });

  it('replaces rather than pushes when the overview request fails', async () => {
    const { settlers } = deferredFetch();
    const searchEvents: string[] = [];
    const onSearchChange = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        searchEvents.push(event.detail);
      }
    };
    window.addEventListener(CLIENT_SEARCH_CHANGE_EVENT, onSearchChange);

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());

    await act(async () => {
      settlers[0]?.reject(new Error('network down'));
      await Promise.resolve();
    });

    window.removeEventListener(CLIENT_SEARCH_CHANGE_EVENT, onSearchChange);

    expect(routerStub.replace).toHaveBeenCalledTimes(1);
    expect(routerStub.replace).toHaveBeenCalledWith('/overview?tier=75', { scroll: false });
    expect(routerStub.push).not.toHaveBeenCalled();
    // The failed selection stays in the address bar so a retry click still works.
    expect(window.location.search).toBe('?tier=75');
    expect(searchEvents).toEqual(['?tier=75']);
  });

  it('pushes one history entry when the same selection repeats while pending', () => {
    deferredFetch();

    renderProvider(pageData(50), '/overview');
    // Deltas, not absolutes: beforeEach uses replaceState, so entries persist
    // across tests in one jsdom window.
    const before = window.history.length;
    act(() => selectTier?.());
    act(() => selectTier?.());

    expect(window.history.length - before).toBe(1);
    expect(window.location.search).toBe('?tier=75');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reloads on a failed popstate commit', async () => {
    renderProvider(pageData(50), '/overview');

    const { settlers } = deferredFetch();
    // Move the URL first: snapshotting `location` before this freezes a stale
    // search, the href resolves to the seeded one and the load hits the cache.
    window.history.pushState({}, '', '/overview?tier=75');
    const reload = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/overview',
      search: '?tier=75',
      hash: '',
      origin: 'http://localhost',
      reload,
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await Promise.resolve();
      settlers[0]?.reject(new Error('network down'));
      await Promise.resolve();
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('fetches on a cache-miss popstate and ignores non-overview routes', async () => {
    renderProvider(pageData(50), '/overview');
    const { stub, settlers } = deferredFetch();

    window.history.replaceState({}, '', '/overview?tier=75');
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await Promise.resolve();
      settlers[0]?.resolve(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(stub).toHaveBeenCalledWith('/api/v1/overview?tier=75', {
      headers: { Accept: 'application/json' },
    });
    expect(readProbe('tier')).toBe('75');

    stub.mockClear();
    window.history.replaceState({}, '', '/inference');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(stub).not.toHaveBeenCalled();
  });

  it('commits a /zh/overview popstate', async () => {
    renderProvider(pageData(50), '/zh/overview');
    const { stub, settlers } = deferredFetch();

    window.history.replaceState({}, '', '/zh/overview?tier=75');
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
      await Promise.resolve();
      settlers[0]?.resolve(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(stub).toHaveBeenCalledWith('/api/v1/overview?tier=75', {
      headers: { Accept: 'application/json' },
    });
    expect(readProbe('tier')).toBe('75');
  });

  it('coalesces repeated prefetches of one href', () => {
    deferredFetch();

    renderProvider(pageData(50), '/overview');
    act(() => prefetchTier?.());
    act(() => prefetchTier?.());
    act(() => selectTier?.());

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after a failed prefetch', async () => {
    const stub = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(Response.json(pageData(75)));
    vi.stubGlobal('fetch', stub);

    renderProvider(pageData(50), '/overview');
    await act(async () => {
      prefetchTier?.();
      await Promise.resolve();
    });
    await act(async () => {
      selectTier?.();
      await Promise.resolve();
    });

    expect(stub).toHaveBeenCalledTimes(2);
    expect(readProbe('tier')).toBe('75');
  });

  it('lets the last of two overlapping selections win', async () => {
    const { settlers } = deferredFetch();

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());
    act(() => selectEngine?.());

    await act(async () => {
      // Resolve the superseded request last; it must not overwrite the winner.
      settlers[1]?.resolve(Response.json({ ...pageData(50), engineScope: 'all' }));
      await Promise.resolve();
      settlers[0]?.resolve(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(readProbe('tier')).toBe('50');
    expect(window.location.search).toBe('?tier=75&engine=all');
  });

  it('reports a pending window that closes when the response lands', async () => {
    const { settlers } = deferredFetch();

    renderProvider(pageData(50), '/overview');
    expect(readProbe('pending')).toBe('settled');

    act(() => selectTier?.());
    expect(readProbe('pending')).toBe('pending');

    await act(async () => {
      settlers[0]?.resolve(Response.json(pageData(75)));
      await Promise.resolve();
    });

    expect(readProbe('pending')).toBe('settled');
    expect(readProbe('tier')).toBe('75');
  });

  it('keys the cache by canonical data identity', async () => {
    const stub = vi.fn().mockResolvedValue(Response.json(pageData(50)));
    vi.stubGlobal('fetch', stub);

    window.history.replaceState({}, '', '/overview?tier=50&utm_source=x');
    renderProvider(pageData(50), '/overview?tier=50');

    await act(async () => {
      selectReference?.();
      await Promise.resolve();
    });

    expect(stub).not.toHaveBeenCalled();
    expect(readProbe('reference')).toBe('b300');
  });

  it('does not report a load for a reference-only change', () => {
    const { stub } = deferredFetch();

    renderProvider(pageData(50), '/overview');
    act(() => selectReference?.());

    expect(stub).not.toHaveBeenCalled();
    expect(readProbe('reference')).toBe('b300');
    expect(readProbe('pending')).toBe('settled');
  });

  it('keeps a reference chosen while a failing selection was in flight', async () => {
    const { settlers } = deferredFetch();

    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());
    // Same data key, so this joins the in-flight tier request rather than
    // starting one of its own.
    act(() => selectReference?.());

    await act(async () => {
      settlers[0]?.reject(new Error('network down'));
      await Promise.resolve();
    });

    expect(settlers).toHaveLength(1);
    expect(routerStub.replace).toHaveBeenCalledWith('/overview?tier=75&ref=b300', {
      scroll: false,
    });
    expect(readProbe('tier')).toBe('50');
    expect(readProbe('reference')).toBe('b300');
  });

  it('preserves unknown params and the fragment on the first selection', () => {
    deferredFetch();

    window.history.replaceState({}, '', '/overview?utm_source=x#frag');
    renderProvider(pageData(50), '/overview');
    act(() => selectTier?.());

    expect(`${window.location.search}${window.location.hash}`).toBe('?tier=75&utm_source=x#frag');
    expect(fetch).toHaveBeenCalledWith('/api/v1/overview?tier=75', {
      headers: { Accept: 'application/json' },
    });
  });
});
