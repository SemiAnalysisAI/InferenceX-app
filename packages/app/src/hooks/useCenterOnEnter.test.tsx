// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { centeredScrollTop, useCenterOnEnter } from './useCenterOnEnter';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

describe('centeredScrollTop', () => {
  it('centers a short element in the area below the sticky header', () => {
    expect(
      centeredScrollTop({
        elementTop: 900,
        elementHeight: 400,
        viewportHeight: 1000,
        stickyOffset: 60,
        scrollY: 0,
      }),
    ).toBe(900 - 60 - 270);
  });

  it('aligns a tall element to the bottom of the sticky header', () => {
    expect(
      centeredScrollTop({
        elementTop: 500,
        elementHeight: 1200,
        viewportHeight: 800,
        stickyOffset: 60,
        scrollY: 100,
      }),
    ).toBe(540);
  });

  it('never scrolls above the page top', () => {
    expect(
      centeredScrollTop({
        elementTop: 100,
        elementHeight: 200,
        viewportHeight: 1000,
        stickyOffset: 60,
        scrollY: 0,
      }),
    ).toBe(0);
  });
});

function Harness({ ready, enabled = true }: { ready: boolean; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCenterOnEnter(ref, '[data-testid="target"]', { enabled, ready });
  return <div ref={ref}>{ready && <figure data-testid="target" />}</div>;
}

describe('useCenterOnEnter', () => {
  let container: HTMLDivElement;
  let root: Root;
  const scrollTo = vi.fn();

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    scrollTo.mockReset();
    window.scrollTo = scrollTo as typeof window.scrollTo;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    window.history.replaceState(null, '', '/inference');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 900,
      height: 400,
    } as DOMRect);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('scrolls once after the chart is ready', () => {
    act(() => root.render(<Harness ready={false} />));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => root.render(<Harness ready />));
    act(() => root.render(<Harness ready />));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
  });

  it('leaves the page alone when the URL has a hash', () => {
    window.history.replaceState(null, '', '/inference#benchmark');
    act(() => root.render(<Harness ready />));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves the page alone when the user scrolled before the chart loaded', () => {
    act(() => root.render(<Harness ready={false} />));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 });
    act(() => root.render(<Harness ready />));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    act(() => root.render(<Harness ready enabled={false} />));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
