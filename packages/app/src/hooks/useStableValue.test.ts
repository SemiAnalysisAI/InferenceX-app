// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { useStableValue } from './useStableValue';

// Lightweight renderHook with re-renderable input — TLR isn't installed.
function renderHookWithInput<P, T>(
  hook: (props: P) => T,
  initial: P,
): { result: { current: T }; rerender: (props: P) => void; unmount: () => void; root: Root } {
  const result = { current: undefined as unknown as T };
  let props = initial;
  function TestComponent() {
    result.current = hook(props);
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
    rerender: (next: P) => {
      props = next;
      render();
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    root,
  };
}

interface Domainish {
  type: string;
  domain: [number, number];
}

const sameDomain = (a: Domainish, b: Domainish) =>
  a.type === b.type && a.domain[0] === b.domain[0] && a.domain[1] === b.domain[1];

describe('useStableValue', () => {
  it('returns the initial value on first render', () => {
    const value: Domainish = { type: 'linear', domain: [0, 105] };
    const { result, unmount } = renderHookWithInput(
      (v: Domainish) => useStableValue(v, sameDomain),
      value,
    );
    expect(result.current).toBe(value);
    unmount();
  });

  it('preserves the previous reference when the new value is equal', () => {
    const first: Domainish = { type: 'linear', domain: [0, 105] };
    const { result, rerender, unmount } = renderHookWithInput(
      (v: Domainish) => useStableValue(v, sameDomain),
      first,
    );

    // Recomputed object (e.g. scale config after a legend toggle) with the
    // same value — downstream effects keyed on it must not re-fire.
    rerender({ type: 'linear', domain: [0, 105] });
    expect(result.current).toBe(first);
    unmount();
  });

  it('adopts the new reference when the value changes', () => {
    const first: Domainish = { type: 'linear', domain: [0, 105] };
    const { result, rerender, unmount } = renderHookWithInput(
      (v: Domainish) => useStableValue(v, sameDomain),
      first,
    );

    const changed: Domainish = { type: 'linear', domain: [0, 210] };
    rerender(changed);
    expect(result.current).toBe(changed);

    // And keeps the adopted reference on subsequent equal values.
    rerender({ type: 'linear', domain: [0, 210] });
    expect(result.current).toBe(changed);
    unmount();
  });

  it('treats a type change as a new value even with identical domains', () => {
    const linear: Domainish = { type: 'linear', domain: [1, 100] };
    const { result, rerender, unmount } = renderHookWithInput(
      (v: Domainish) => useStableValue(v, sameDomain),
      linear,
    );

    const log: Domainish = { type: 'log', domain: [1, 100] };
    rerender(log);
    expect(result.current).toBe(log);
    unmount();
  });
});
