// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateGraphDatasetCache,
  useGraphDataset,
  type GraphDatasetContext,
} from '@/hooks/agentic-workload-explorer/use-graph-dataset';
import { useLazyVisible } from '@/hooks/agentic-workload-explorer/use-infinite-scroll';

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

interface PendingFetch {
  url: string;
  resolveJson: (body: Record<string, unknown>) => void;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  ControlledIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  invalidateGraphDatasetCache();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  invalidateGraphDatasetCache();
  vi.unstubAllGlobals();
});

function LazyVisibleHarness({ resetKey, onVisible }: { resetKey: string; onVisible: () => void }) {
  const ref = useLazyVisible<HTMLDivElement>({ enabled: true, onVisible, resetKey });
  return <div ref={ref}>chart</div>;
}

function GraphDatasetHarness({
  datasetKey,
  context,
}: {
  datasetKey: string;
  context: GraphDatasetContext;
}) {
  const { ref, data, loading, error } = useGraphDataset<{ source: string }>(datasetKey, context);
  return (
    <div ref={ref}>{loading ? 'loading' : error ? 'error' : data ? data.source : 'empty'}</div>
  );
}

function installControlledFetch() {
  const pending: PendingFetch[] = [];
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    return new Promise<Response>((resolve) => {
      pending.push({
        url,
        resolveJson(body) {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(body),
          } as Response);
        },
      });
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return pending;
}

async function resolveFetch(request: PendingFetch, body: Record<string, unknown>) {
  await act(async () => {
    request.resolveJson(body);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useLazyVisible', () => {
  it('re-arms an already-visible mounted element when its reset identity changes', () => {
    const visibleIdentities: string[] = [];

    act(() => {
      root.render(
        <LazyVisibleHarness
          resetKey="model-a"
          onVisible={() => visibleIdentities.push('model-a')}
        />,
      );
    });

    expect(ControlledIntersectionObserver.instances).toHaveLength(1);
    act(() => ControlledIntersectionObserver.instances[0].intersect());
    expect(visibleIdentities).toEqual(['model-a']);

    act(() => {
      root.render(
        <LazyVisibleHarness
          resetKey="model-b"
          onVisible={() => visibleIdentities.push('model-b')}
        />,
      );
    });

    expect(ControlledIntersectionObserver.instances).toHaveLength(2);
    act(() => ControlledIntersectionObserver.instances[1].intersect());
    expect(visibleIdentities).toEqual(['model-a', 'model-b']);
  });
});

describe('useGraphDataset', () => {
  it('keeps the switched context when the previous request resolves last', async () => {
    const requests = installControlledFetch();
    const oldContext: GraphDatasetContext = {
      baseUrl: '/api/v1/agentic-workload-explorer/graphs?model=old-model',
      traceVersionParam: 1,
    };
    const newContext: GraphDatasetContext = {
      baseUrl: '/api/v1/agentic-workload-explorer/graphs?model=new-model',
      traceVersionParam: 2,
    };

    act(() => {
      root.render(<GraphDatasetHarness datasetKey="requestStats" context={oldContext} />);
    });
    act(() => ControlledIntersectionObserver.instances[0].intersect());
    expect(requests.map((request) => request.url)).toEqual([
      '/api/v1/agentic-workload-explorer/graphs?model=old-model&include=requestStats&version=1',
    ]);

    act(() => {
      root.render(<GraphDatasetHarness datasetKey="requestStats" context={newContext} />);
    });
    expect(container.textContent).toBe('loading');
    expect(ControlledIntersectionObserver.instances).toHaveLength(2);
    act(() => ControlledIntersectionObserver.instances[1].intersect());
    expect(requests.map((request) => request.url)).toEqual([
      '/api/v1/agentic-workload-explorer/graphs?model=old-model&include=requestStats&version=1',
      '/api/v1/agentic-workload-explorer/graphs?model=new-model&include=requestStats&version=2',
    ]);

    await resolveFetch(requests[1], { requestStats: { source: 'new-context' } });
    expect(container.textContent).toBe('new-context');

    await resolveFetch(requests[0], { requestStats: { source: 'stale-context' } });
    expect(container.textContent).toBe('new-context');
  });
});
