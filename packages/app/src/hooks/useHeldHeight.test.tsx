// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHeldHeight } from './useHeldHeight';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let observers: { callback: ResizeObserverCallback; disconnected: boolean }[] = [];

class StubResizeObserver {
  private readonly entry: { callback: ResizeObserverCallback; disconnected: boolean };
  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, disconnected: false };
    observers.push(this.entry);
  }
  observe() {}
  disconnect() {
    this.entry.disconnected = true;
  }
}

function resize(height: number) {
  for (const observer of observers) {
    if (observer.disconnected) continue;
    observer.callback(
      [{ borderBoxSize: [{ blockSize: height, inlineSize: 0 }] } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  }
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Probe({ hold }: { hold: boolean }) {
  const ref = useHeldHeight<HTMLDivElement>(hold);
  return <div ref={ref} data-testid="held" />;
}

const held = () => container.querySelector<HTMLDivElement>('[data-testid="held"]')!;

describe('useHeldHeight', () => {
  it('keeps the last settled height while held and releases it afterwards', () => {
    act(() => root.render(<Probe hold={false} />));
    resize(640);
    act(() => root.render(<Probe hold />));
    expect(held().style.minHeight).toBe('640px');

    resize(180);
    act(() => root.render(<Probe hold />));
    expect(held().style.minHeight).toBe('640px');

    act(() => root.render(<Probe hold={false} />));
    expect(held().style.minHeight).toBe('');
  });

  it('reserves nothing before the element has been measured', () => {
    act(() => root.render(<Probe hold />));
    expect(held().style.minHeight).toBe('');
  });

  it('holds the height measured after the previous hold ended', () => {
    act(() => root.render(<Probe hold={false} />));
    resize(400);
    act(() => root.render(<Probe hold />));
    act(() => root.render(<Probe hold={false} />));
    resize(720);
    act(() => root.render(<Probe hold />));
    expect(held().style.minHeight).toBe('720px');
  });

  it('stops observing when the element unmounts', () => {
    act(() => root.render(<Probe hold={false} />));
    act(() => root.render(<div />));
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
  });
});
