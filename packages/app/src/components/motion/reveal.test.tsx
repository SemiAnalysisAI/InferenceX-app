// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Reveal } from '@/components/motion/reveal';

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let container: HTMLDivElement;
let root: Root;
let observerCallbacks: ObserverCallback[];
let disconnectSpy: ReturnType<typeof vi.fn>;

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallbacks.push(callback);
  }
  observe = vi.fn();
  disconnect = disconnectSpy;
  unobserve = vi.fn();
}

beforeEach(() => {
  observerCallbacks = [];
  disconnectSpy = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Reveal', () => {
  it('renders children with data-reveal and no data-inview before intersection', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    act(() => root.render(<Reveal>content</Reveal>));
    const node = container.querySelector<HTMLElement>('[data-reveal]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toBe('content');
    expect(node?.dataset.inview).toBeUndefined();
  });

  it('flips data-inview once the block intersects and disconnects the observer', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    act(() => root.render(<Reveal>content</Reveal>));
    act(() => observerCallbacks[0]([{ isIntersecting: true }]));
    const node = container.querySelector<HTMLElement>('[data-reveal]');
    expect(node?.dataset.inview).toBe('true');
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('reveals immediately when IntersectionObserver is unavailable', () => {
    act(() => root.render(<Reveal>content</Reveal>));
    const node = container.querySelector<HTMLElement>('[data-reveal]');
    expect(node?.dataset.inview).toBe('true');
  });

  it('applies the stagger delay as a CSS custom property', () => {
    act(() => root.render(<Reveal delayMs={170}>content</Reveal>));
    const node = container.querySelector('[data-reveal]') as HTMLElement;
    expect(node.style.getPropertyValue('--motion-reveal-delay')).toBe('170ms');
  });
});
