// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Controllable URL-param source. `getUrlParam` identity is stable across renders
// (the real hook memoizes it), matching production so the mount effect fires once.
const urlParams = vi.hoisted(() => ({ current: {} as Record<string, string | null> }));
const getUrlParam = vi.hoisted(() => (key: string) => urlParams.current[key] ?? null);
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam }),
}));

import { useQuickFiltersState } from './useQuickFiltersState';

// Minimal renderHook (TLR isn't installed — mirrors src/hooks/useStableValue.test.ts).
function renderHook<T>(hook: () => T): {
  result: { current: T };
  rerender: () => void;
  unmount: () => void;
} {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = () =>
    act(() => {
      root.render(createElement(TestComponent));
    });
  render();
  return {
    result,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('useQuickFiltersState', () => {
  beforeEach(() => {
    urlParams.current = {};
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts empty when no URL params are present (SSR-matching first render)', () => {
    const { result, unmount } = renderHook(() => useQuickFiltersState());
    expect(result.current.quickFilters).toEqual({
      vendors: [],
      frameworks: [],
      disagg: [],
      spec: [],
    });
    unmount();
  });

  it('hydrates each category from its URL param after mount', () => {
    urlParams.current = {
      i_vendor: 'NVIDIA,AMD',
      i_fw: 'vllm,sglang',
      i_disagg: 'agg,disagg',
      i_spec: 'mtp',
    };
    const { result, unmount } = renderHook(() => useQuickFiltersState());
    expect(result.current.quickFilterVendors).toEqual(['NVIDIA', 'AMD']);
    expect(result.current.quickFilterFrameworks).toEqual(['vllm', 'sglang']);
    expect(result.current.quickFilterDisagg).toEqual(['agg', 'disagg']);
    expect(result.current.quickFilterSpec).toEqual(['mtp']);
    unmount();
  });

  it('ignores empty/whitespace-only param segments', () => {
    urlParams.current = { i_vendor: 'NVIDIA,,', i_fw: '' };
    const { result, unmount } = renderHook(() => useQuickFiltersState());
    expect(result.current.quickFilterVendors).toEqual(['NVIDIA']);
    expect(result.current.quickFilterFrameworks).toEqual([]);
    unmount();
  });

  it('keeps quickFilters referentially stable across a no-op rerender', () => {
    const { result, rerender, unmount } = renderHook(() => useQuickFiltersState());
    const first = result.current.quickFilters;
    rerender();
    expect(result.current.quickFilters).toBe(first);
    unmount();
  });

  it('updates quickFilters (and its reference) when a setter runs', () => {
    const { result, unmount } = renderHook(() => useQuickFiltersState());
    const before = result.current.quickFilters;
    act(() => result.current.setQuickFilterVendors(['AMD']));
    expect(result.current.quickFilters.vendors).toEqual(['AMD']);
    expect(result.current.quickFilters).not.toBe(before);
    unmount();
  });
});
