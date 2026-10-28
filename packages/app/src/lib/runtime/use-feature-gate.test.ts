// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import {
  FEATURE_GATE_KEY,
  FEATURE_GATE_LOCKED_EVENT,
  FEATURE_GATE_UNLOCKED_EVENT,
  relockFeatureGate,
  useFeatureGate,
} from './use-feature-gate';

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'B',
  'A',
];

function pressKeys(keys: string[]): void {
  act(() => {
    for (const key of keys) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }
  });
}

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

  it('rejects and removes the legacy saved unlock', () => {
    localStorage.setItem('inferencex-feature-gate', '1');
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(false);
    expect(localStorage.getItem('inferencex-feature-gate')).toBeNull();
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    pressKeys(KONAMI_CODE);
    expect(result.current).toBe(true);
    unmount();
  });

  it('unlocks after the full uppercase Konami code and persists across remounts', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    expect(result.current).toBe(false);
    pressKeys(KONAMI_CODE.slice(0, -1));
    expect(result.current).toBe(false);
    pressKeys(['A']);
    expect(result.current).toBe(true);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBe('1');
    unmount();
    const restored = renderHook(() => useFeatureGate());
    expect(restored.result.current).toBe(true);
    restored.unmount();
  });

  it('does not unlock with the old four-arrow sequence', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys(KONAMI_CODE.slice(0, 4));
    expect(result.current).toBe(false);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    unmount();
  });

  it.each([
    ['b', 'a'],
    ['b', 'A'],
    ['B', 'a'],
  ])('rejects case-sensitive suffix %s %s', (b, a) => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys([...KONAMI_CODE.slice(0, 8), b, a]);
    expect(result.current).toBe(false);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    unmount();
  });

  it.each(['Shift', 'CapsLock'])('allows %s before the uppercase suffix', (modifier) => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys([...KONAMI_CODE.slice(0, 8), modifier, 'B', 'A']);
    expect(result.current).toBe(true);
    unmount();
  });

  it('does not count auto-repeat as a second arrow press', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys(['ArrowUp']);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', repeat: true }));
    });
    pressKeys(KONAMI_CODE.slice(2));
    expect(result.current).toBe(false);
    unmount();
  });

  it('ignores partial / out-of-order sequences', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    act(() => {
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
    });
    expect(result.current).toBe(false);
    expect(localStorage.getItem(FEATURE_GATE_KEY)).toBeNull();
    unmount();
  });

  it('accepts the complete sequence after unrelated keys', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    act(() => {
      for (const key of ['a', 'b', ...KONAMI_CODE]) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
    });
    expect(result.current).toBe(true);
    unmount();
  });

  it('flips back to locked when FEATURE_GATE_LOCKED_EVENT fires (e.g. via relockFeatureGate)', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys(KONAMI_CODE);
    expect(result.current).toBe(true);
    act(() => {
      relockFeatureGate();
    });
    expect(result.current).toBe(false);
    pressKeys(['A']);
    expect(result.current).toBe(false);
    pressKeys(KONAMI_CODE);
    expect(result.current).toBe(true);
    unmount();
  });

  it('clears a partial sequence on relock even when already locked', () => {
    const { result, unmount } = renderHook(() => useFeatureGate());
    pressKeys(KONAMI_CODE.slice(0, -1));
    act(() => relockFeatureGate());
    pressKeys(['A']);
    expect(result.current).toBe(false);
    pressKeys(KONAMI_CODE);
    expect(result.current).toBe(true);
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
