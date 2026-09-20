// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useParetoHighlightToggle } from './useParetoHighlightToggle';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function renderHook<T>(hook: () => T) {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(TestComponent)));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { result };
}

describe('useParetoHighlightToggle', () => {
  it('cycles off → plain → off → playful → off → plain, ignoring repeated values', () => {
    const { result } = renderHook(() => useParetoHighlightToggle());
    expect(result.current.visible).toBe(false);
    act(() => result.current.setVisible(true));
    expect(result.current).toMatchObject({ visible: true, playful: false });
    act(() => result.current.setVisible(true));
    expect(result.current.playful).toBe(false);
    act(() => result.current.setVisible(false));
    expect(result.current.visible).toBe(false);
    act(() => result.current.setVisible(true));
    expect(result.current).toMatchObject({ visible: true, playful: true });
    act(() => result.current.setVisible(false));
    act(() => result.current.setVisible(true));
    expect(result.current).toMatchObject({ visible: true, playful: false });
  });
  it.each([
    ['1', false],
    ['2', true],
  ] as const)('restores frontier mode %s from share links', (mode, playful) => {
    const { result } = renderHook(() => useParetoHighlightToggle(mode));
    expect(result.current).toMatchObject({ visible: true, playful });
    act(() => result.current.setVisible(false));
    expect(result.current.visible).toBe(false);
    act(() => result.current.setVisible(true));
    expect(result.current).toMatchObject({ visible: true, playful: !playful });
  });
});
