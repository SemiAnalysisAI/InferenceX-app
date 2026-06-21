// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useResponsiveChartDimensions,
  type UseResponsiveChartDimensionsResult,
} from './useResponsiveChartDimensions';

// Minimal ResizeObserver stand-in — jsdom doesn't implement it. Tests fire
// observations manually via `trigger`.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }

  disconnect() {
    this.disconnected = true;
  }

  unobserve() {}

  trigger(width: number) {
    act(() => {
      this.callback(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    });
  }
}

function renderHook<T>(hook: () => T): {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
  root: Root;
} {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () => {
    act(() => {
      root.render(createElement(TestComponent));
    });
  };
  render();
  return {
    result,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    root,
  };
}

/** Create a container div whose getBoundingClientRect reports `width`. */
function makeContainer(width: number): HTMLDivElement {
  const el = document.createElement('div');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
  return el;
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useResponsiveChartDimensions', () => {
  it('measures the container on attach', () => {
    const { result, unmount } = renderHook<UseResponsiveChartDimensionsResult>(() =>
      useResponsiveChartDimensions({ height: 600 }),
    );

    act(() => {
      result.current.setContainerRef(makeContainer(800));
    });

    expect(result.current.dimensions).toEqual({ width: 800, height: 600 });
    unmount();
  });

  it('keeps the dimensions object identity when an observation reports the same size', () => {
    const { result, unmount } = renderHook<UseResponsiveChartDimensionsResult>(() =>
      useResponsiveChartDimensions({ height: 600 }),
    );

    act(() => {
      result.current.setContainerRef(makeContainer(800));
    });
    const initial = result.current.dimensions;

    // ResizeObserver fires once right after observe() with the width the ref
    // callback already measured. The object identity must not change — a new
    // identity makes every chart treat it as a resize and fully rebuild.
    MockResizeObserver.instances.at(-1)!.trigger(800);

    expect(result.current.dimensions).toBe(initial);
    unmount();
  });

  it('updates dimensions when an observation reports a new width', () => {
    const { result, unmount } = renderHook<UseResponsiveChartDimensionsResult>(() =>
      useResponsiveChartDimensions({ height: 600 }),
    );

    act(() => {
      result.current.setContainerRef(makeContainer(800));
    });
    const initial = result.current.dimensions;

    MockResizeObserver.instances.at(-1)!.trigger(1024);

    expect(result.current.dimensions).not.toBe(initial);
    expect(result.current.dimensions).toEqual({ width: 1024, height: 600 });
    unmount();
  });

  it('disconnects the previous observer when the container changes', () => {
    const { result, unmount } = renderHook<UseResponsiveChartDimensionsResult>(() =>
      useResponsiveChartDimensions({ height: 600 }),
    );

    act(() => {
      result.current.setContainerRef(makeContainer(800));
    });
    const first = MockResizeObserver.instances.at(-1)!;

    act(() => {
      result.current.setContainerRef(makeContainer(640));
    });

    expect(first.disconnected).toBe(true);
    expect(result.current.dimensions).toEqual({ width: 640, height: 600 });
    unmount();
  });

  it('detaches cleanly when the container is removed', () => {
    const { result, unmount } = renderHook<UseResponsiveChartDimensionsResult>(() =>
      useResponsiveChartDimensions({ height: 600 }),
    );

    act(() => {
      result.current.setContainerRef(makeContainer(800));
    });
    const observer = MockResizeObserver.instances.at(-1)!;

    act(() => {
      result.current.setContainerRef(null);
    });

    expect(observer.disconnected).toBe(true);
    // Last measured dimensions are retained (no reset to 0 on detach).
    expect(result.current.dimensions).toEqual({ width: 800, height: 600 });
    unmount();
  });
});
