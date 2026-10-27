// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import { BottomToast } from './bottom-toast';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function touch(type: 'touchstart' | 'touchend', x: number, y: number) {
  const point = { clientX: x, clientY: y, identifier: 0 };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches: type === 'touchend' ? [] : [point],
    changedTouches: [point],
  });
  return event;
}

function renderToast(onDismiss: () => void) {
  act(() =>
    root.render(
      <BottomToast
        icon={null}
        title="Every result is reproducible"
        description="Each point links to its run."
        onDismiss={onDismiss}
        testId="toast"
      />,
    ),
  );
  return container.querySelector<HTMLElement>('[data-testid="toast"]')!;
}

describe('BottomToast swipe to dismiss', () => {
  it('dismisses on a quick horizontal flick with no touchmove', () => {
    const onDismiss = vi.fn();
    const toast = renderToast(onDismiss);
    act(() => {
      toast.dispatchEvent(touch('touchstart', 200, 700));
      toast.dispatchEvent(touch('touchend', 320, 705));
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('stays open for a short tap', () => {
    const onDismiss = vi.fn();
    const toast = renderToast(onDismiss);
    act(() => {
      toast.dispatchEvent(touch('touchstart', 200, 700));
      toast.dispatchEvent(touch('touchend', 210, 702));
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('stays open when a vertical page-scroll gesture starts on it', () => {
    const onDismiss = vi.fn();
    const toast = renderToast(onDismiss);
    act(() => {
      toast.dispatchEvent(touch('touchstart', 200, 600));
      toast.dispatchEvent(touch('touchend', 230, 760));
    });
    act(() => vi.advanceTimersByTime(400));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

function stubViewport(isPhone: boolean, height: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: isPhone,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height,
  } as DOMRect);
}

describe('BottomToast phone layout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.style.paddingBottom = '';
  });

  it('reserves the docked bar height below the page on phones and releases it on dismiss', () => {
    stubViewport(true, 56);
    renderToast(vi.fn());
    expect(document.body.style.paddingBottom).toBe('56px');

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click();
    });
    act(() => vi.advanceTimersByTime(400));
    expect(document.body.style.paddingBottom).toBe('');
  });

  it('leaves page spacing alone on wider screens where the toast floats in a corner', () => {
    stubViewport(false, 120);
    renderToast(vi.fn());
    expect(document.body.style.paddingBottom).toBe('');
  });
});
