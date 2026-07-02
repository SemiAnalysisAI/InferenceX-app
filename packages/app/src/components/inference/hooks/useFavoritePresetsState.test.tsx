// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { useFavoritePresetsState } from './useFavoritePresetsState';

// Minimal renderHook (TLR isn't installed).
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

describe('useFavoritePresetsState', () => {
  it('initializes with no active preset and cleared refs', () => {
    const { result, unmount } = renderHook(() => useFavoritePresetsState());
    expect(result.current.activePresetId).toBeNull();
    expect(result.current.pendingHwFilter).toBeNull();
    expect(result.current.pendingTimelinePreset).toBeNull();
    expect(result.current.presetGuardRef.current).toBe(false);
    expect(result.current.presetHwFilterRef.current).toBeNull();
    expect(result.current.presetVersionRef.current).toBe(0);
    unmount();
  });

  it('clearPresetOnChange deactivates the active preset and clears the hw-filter ref', () => {
    const { result, unmount } = renderHook(() => useFavoritePresetsState());
    act(() => {
      result.current.setActivePresetId('preset-a');
      result.current.presetHwFilterRef.current = ['h100'];
    });
    expect(result.current.activePresetId).toBe('preset-a');

    act(() => result.current.clearPresetOnChange());
    expect(result.current.activePresetId).toBeNull();
    expect(result.current.presetHwFilterRef.current).toBeNull();
    unmount();
  });

  it('clearPresetOnChange is a no-op while the preset guard is set (apply in progress)', () => {
    const { result, unmount } = renderHook(() => useFavoritePresetsState());
    act(() => {
      result.current.setActivePresetId('preset-b');
      result.current.presetHwFilterRef.current = ['b200'];
    });

    // Simulate FavoritePresetsDropdown guarding a programmatic apply: the
    // guard must block the deactivation that a user-change would trigger.
    act(() => {
      result.current.presetGuardRef.current = true;
      result.current.clearPresetOnChange();
      result.current.presetGuardRef.current = false;
    });

    expect(result.current.activePresetId).toBe('preset-b');
    expect(result.current.presetHwFilterRef.current).toEqual(['b200']);
    unmount();
  });

  it('keeps clearPresetOnChange referentially stable across rerenders', () => {
    const { result, rerender, unmount } = renderHook(() => useFavoritePresetsState());
    const first = result.current.clearPresetOnChange;
    act(() => result.current.setActivePresetId('preset-c'));
    rerender();
    expect(result.current.clearPresetOnChange).toBe(first);
    unmount();
  });

  it('exposes stable ref objects across rerenders', () => {
    const { result, rerender, unmount } = renderHook(() => useFavoritePresetsState());
    const guard = result.current.presetGuardRef;
    const hwFilter = result.current.presetHwFilterRef;
    rerender();
    expect(result.current.presetGuardRef).toBe(guard);
    expect(result.current.presetHwFilterRef).toBe(hwFilter);
    unmount();
  });
});
