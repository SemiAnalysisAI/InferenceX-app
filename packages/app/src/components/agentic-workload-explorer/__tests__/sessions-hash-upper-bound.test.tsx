// @vitest-environment jsdom

import { act, useCallback, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as InfiniteScrollModule from '@/hooks/agentic-workload-explorer/use-infinite-scroll';
import type { Session } from '@/lib/agentic-workload-explorer/api-types';

const mocks = vi.hoisted(() => ({
  resetSessions: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/agentic-workload-explorer/sessions',
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/agentic-workload-explorer/use-infinite-scroll', async (importOriginal) => {
  const actual = await importOriginal<typeof InfiniteScrollModule>();
  return {
    ...actual,
    useInfiniteList: () => {
      const [hasMore, setHasMore] = useState(false);
      const reset = useCallback((items: Session[], more: boolean) => {
        mocks.resetSessions(items, more);
        setHasMore(true);
      }, []);
      const sentinelRef = actual.useInfiniteScroll({
        hasMore,
        loading: false,
        onLoadMore: () => {},
      });
      return {
        items: [session],
        reset,
        loadingMore: false,
        hasMore,
        sentinelRef,
      };
    },
  };
});

import SessionsPage from '@/components/agentic-workload-explorer/views/sessions-view';

const session: Session = {
  id: 'session-explicit-hash-load',
  clientId: 'client-1',
  startedAt: '2026-07-06T10:00:00.000Z',
  lastActiveAt: '2026-07-06T10:01:00.000Z',
  metadata: null,
  clientApiKeyHash: 'client-key-hash',
  requestCount: 21,
  totalInput: 300,
  totalCacheRead: 100,
  totalCacheWrite: 100,
  totalOutput: 50,
  totalCost: 0.01,
  privacyMode: 'anon',
};

const hashStatsUrl = `/api/v1/agentic-workload-explorer/sessions/${session.id}/hash-stats`;

class ControlledIntersectionObserver implements IntersectionObserver {
  static instances: ControlledIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = '0px';
  readonly thresholds = [0];
  private target: Element | null = null;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '0px';
    ControlledIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  unobserve(target: Element) {
    if (this.target === target) this.target = null;
  }

  disconnect() {
    this.target = null;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  intersect() {
    if (!this.target) throw new Error('Cannot intersect a disconnected observer');
    const target = this.target;
    this.callback(
      [
        {
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting: true,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this,
    );
  }
}

let container: HTMLDivElement;
let root: Root;
let requests: string[];

beforeEach(() => {
  ControlledIntersectionObserver.instances = [];
  requests = [];
  mocks.resetSessions.mockClear();
  mocks.routerReplace.mockClear();
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url === hashStatsUrl) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ hashCached: 293, hashTotal: 400, hitRate: 73.25 }),
        } as Response);
      }
      if (url.startsWith('/api/v1/agentic-workload-explorer/sessions?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              sessions: [session],
              stats: { total: 1, last48h: 1, last7d: 1 },
            }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function settle(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function hashStatsRequests() {
  return requests.filter((url) => url === hashStatsUrl);
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Could not find button named ${name}`);
  return button;
}

describe('sessions hash upper bound', () => {
  it('waits for an explicit Load click before requesting and rendering hash stats', async () => {
    await settle(() => root.render(<SessionsPage />));

    const loadButton = buttonNamed('Load');
    expect(hashStatsRequests()).toEqual([]);
    expect(ControlledIntersectionObserver.instances.length).toBeGreaterThan(0);

    await settle(() => {
      for (const observer of ControlledIntersectionObserver.instances) observer.intersect();
    });
    expect(hashStatsRequests()).toEqual([]);

    await settle(() => {
      loadButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(hashStatsRequests()).toEqual([hashStatsUrl]);
    expect(loadButton.textContent?.trim()).toBe('73.3%');
  });
});
