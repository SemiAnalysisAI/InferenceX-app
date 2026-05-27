// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// analytics.track lazy-imports posthog-js, which is irrelevant here — stub it
// out so an unlock side-effect doesn't fire a network call in jsdom.
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import {
  FEATURE_GATE_KEY,
  FEATURE_GATE_LOCKED_EVENT,
  FEATURE_GATE_UNLOCKED_EVENT,
  relockFeatureGate,
  useFeatureGate,
} from './use-feature-gate';

// Lightweight renderHook — TLR isn't installed, so we mount a 1-component root
// and capture the latest hook return value in a ref-style object.
function renderHook<T>(hook: () => T): { result: { current: T }; unmount: () => void; root: Root } {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(TestComponent));
  });
  return {
    result,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    root,
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('relockFeatureGate', () => {
  it('removes the localStorage key', () => {
    localStorage.setItem(FEATURE_GATE_KEY, '1');
    relockFeatureGate();
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
  });

  it('dispatches FEATURE_GATE_LOCKED_EVENT so other hook consumers re-render', () => {
    const handler = vi.fn();
    window.addEventListener(FEATURE_GATE_LOCKED_EVENT, handler);
    relockFeatureGate();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(FEATURE_GATE_LOCKED_EVENT, handler);
  });

  it('is idempotent — calling twice still ends with no key and one event each call', () => {
    const handler = vi.fn();
    window.addEventListener(FEATURE_GATE_LOCKED_EVENT, handler);
    relockFeatureGate();
    relockFeatureGate();
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
    window.removeEventListener(FEATURE_GATE_LOCKED_EVENT, handler);
  });
});

describe('useFeatureGate', () => {
  it('starts locked when localStorage has no entry', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(false);
    unmount();
  });

  it('rehydrates to true on mount when localStorage already holds the unlock flag', () => {
    localStorage.setItem(FEATURE_GATE_KEY, '1');
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(true);
    unmount();
  });

  it('unlocks after the ↑↑↓↓ keydown sequence and persists to localStorage', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(false);
    act(() => {
      for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
    });
    expect(result.current).toBe(true);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBe('1');
    unmount();
  });

  it('ignores partial / out-of-order sequences', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    act(() => {
      // Reversed direction — must not unlock.
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
    });
    expect(result.current).toBe(false);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    unmount();
  });

  it('accepts the sequence even when wrapped in noise (sliding window of last 4 keys)', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    act(() => {
      for (const key of ['a', 'b', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
    });
    expect(result.current).toBe(true);
    unmount();
  });

  it('flips back to locked when FEATURE_GATE_LOCKED_EVENT fires (e.g. via relockFeatureGate)', () => {
    localStorage.setItem(FEATURE_GATE_KEY, '1');
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(true);
    act(() => {
      relockFeatureGate();
    });
    expect(result.current).toBe(false);
    unmount();
  });

  it('flips to unlocked when FEATURE_GATE_UNLOCKED_EVENT fires from another tab/component', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event(FEATURE_GATE_UNLOCKED_EVENT));
    });
    expect(result.current).toBe(true);
    unmount();
  });
});
