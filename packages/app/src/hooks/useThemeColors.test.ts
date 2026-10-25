// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ resolvedTheme: 'dark' as string | undefined }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: themeState.resolvedTheme }),
}));

import { useThemeColors, type UseThemeColorsResult } from './useThemeColors';

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

const HW_KEYS = ['h100', 'mi300x', 'b200'];

beforeEach(() => {
  vi.useFakeTimers();
  themeState.resolvedTheme = 'dark';
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useThemeColors mount behavior', () => {
  it('keeps themeColors and getCssColor referentially stable across mount effects', () => {
    const { result, rerender, unmount } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: HW_KEYS }),
    );

    const initialThemeColors = result.current.themeColors;
    const initialGetCssColor = result.current.getCssColor;

    act(() => {
      vi.runAllTimers();
    });
    rerender();

    expect(result.current.themeColors).toBe(initialThemeColors);
    expect(result.current.getCssColor).toBe(initialGetCssColor);
    unmount();
  });

  it('stays stable through the next-themes hydration sequence (undefined → defined)', () => {
    themeState.resolvedTheme = undefined;
    const { result, rerender, unmount } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: HW_KEYS }),
    );
    const initialThemeColors = result.current.themeColors;

    themeState.resolvedTheme = 'dark';
    rerender();
    act(() => {
      vi.runAllTimers();
    });
    rerender();

    expect(result.current.themeColors).toBe(initialThemeColors);
    unmount();
  });

  it('re-reads theme colors when the resolved theme actually changes', () => {
    const { result, rerender, unmount } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: HW_KEYS }),
    );
    const initialThemeColors = result.current.themeColors;

    themeState.resolvedTheme = 'light';
    rerender();
    act(() => {
      vi.runAllTimers();
    });
    rerender();

    expect(result.current.themeColors).not.toBe(initialThemeColors);
    unmount();
  });

  it('does not re-read when re-rendered with the same theme after a switch', () => {
    const { result, rerender, unmount } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: HW_KEYS }),
    );

    themeState.resolvedTheme = 'light';
    rerender();
    act(() => {
      vi.runAllTimers();
    });
    rerender();
    const afterSwitch = result.current.themeColors;

    rerender();
    act(() => {
      vi.runAllTimers();
    });
    rerender();

    expect(result.current.themeColors).toBe(afterSwitch);
    unmount();
  });
});

describe('useThemeColors color maps', () => {
  it('generates vendor colors for active hardware keys and muted fallback for inactive', () => {
    const { result, unmount } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: ['h100', 'mi300x'] }),
    );

    expect(result.current.resolveColor('h100')).toMatch(/^oklch\(/u);
    expect(result.current.resolveColor('mi300x')).toMatch(/^oklch\(/u);
    expect(result.current.resolveColor('h100')).not.toBe(result.current.resolveColor('mi300x'));
    expect(result.current.resolveColor('gb200')).toBe('var(--muted-foreground)');
    unmount();
  });

  it('returns null colorMap when highContrast is off and a populated one when on', () => {
    const { result: offResult, unmount: unmountOff } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: false, activeKeys: HW_KEYS }),
    );
    expect(offResult.current.colorMap).toBeNull();
    unmountOff();

    const { result: onResult, unmount: unmountOn } = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: true, activeKeys: HW_KEYS }),
    );
    expect(onResult.current.colorMap).not.toBeNull();
    for (const key of HW_KEYS) {
      expect(onResult.current.colorMap![key]).toMatch(/^#[0-9a-f]{6}$/iu);
    }
    unmountOn();
  });

  it('keeps a line HC color stable across active subsets when hcKeys is the full set', () => {
    const FULL = ['b200', 'b300'];

    const all = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: true, activeKeys: ['b200', 'b300'], hcKeys: FULL }),
    );
    const b200WithBoth = all.result.current.resolveColor('b200');
    const b300Color = all.result.current.resolveColor('b300');
    all.unmount();

    const subset = renderHook<UseThemeColorsResult>(() =>
      useThemeColors({ highContrast: true, activeKeys: ['b200'], hcKeys: FULL }),
    );
    const b200Alone = subset.result.current.resolveColor('b200');
    subset.unmount();

    expect(b200WithBoth).toMatch(/^#[0-9a-f]{6}$/iu);
    expect(b200WithBoth).not.toBe(b300Color);
    expect(b200Alone).toBe(b200WithBoth);
  });
});
