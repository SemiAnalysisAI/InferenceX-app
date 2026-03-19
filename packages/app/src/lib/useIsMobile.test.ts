// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { useIsMobile } from './useIsMobile';

let container: HTMLDivElement;
let root: Root;
let lastResult: boolean;

function TestComponent() {
  lastResult = useIsMobile();
  return null;
}

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, writable: true, configurable: true });
}

function fireResize() {
  window.dispatchEvent(new Event('resize'));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  setWidth(1024);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useIsMobile', () => {
  it('returns false for desktop width (>= 768)', () => {
    setWidth(1024);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(false);
  });

  it('returns true when width < 768 (mobile)', () => {
    setWidth(375);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(true);
  });

  it('returns false when width is exactly 768 (boundary)', () => {
    setWidth(768);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(false);
  });

  it('returns true when width is 767 (just below boundary)', () => {
    setWidth(767);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(true);
  });

  it('updates when window resizes from desktop to mobile', () => {
    setWidth(1024);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(false);

    act(() => {
      setWidth(500);
      fireResize();
    });
    expect(lastResult).toBe(true);
  });

  it('updates when window resizes from mobile to desktop', () => {
    setWidth(500);
    act(() => root.render(React.createElement(TestComponent)));
    expect(lastResult).toBe(true);

    act(() => {
      setWidth(1200);
      fireResize();
    });
    expect(lastResult).toBe(false);
  });

  it('cleans up resize listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    act(() => root.render(React.createElement(TestComponent)));

    const addedHandler = addSpy.mock.calls.find((c) => c[0] === 'resize')?.[1];
    expect(addedHandler).toBeDefined();

    act(() => root.unmount());

    const removedHandler = removeSpy.mock.calls.find((c) => c[0] === 'resize')?.[1];
    expect(removedHandler).toBe(addedHandler);

    addSpy.mockRestore();
    removeSpy.mockRestore();

    // Re-create root since we unmounted
    root = createRoot(container);
  });
});
