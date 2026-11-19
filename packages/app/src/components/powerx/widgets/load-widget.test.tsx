// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '@/lib/analytics/analytics';

import { hardwareStore } from './hardware-store';
import { LoadWidget } from './load-widget';

vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  // Hold animation frames so a value still easing stays visibly behind its target.
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }) as unknown as MediaQueryList,
  );
  window.history.replaceState(null, '', '/pwx/tutorial#hw=b200&ld=570');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWidget() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<LoadWidget locale="en" alt="GPU power slider" />));
  return host;
}

function slider(view: HTMLElement): HTMLInputElement {
  return view.querySelector('input[type="range"]')!;
}

function readout(view: HTMLElement): string {
  return slider(view).closest('div')!.querySelector('span.font-mono')!.textContent ?? '';
}

function drag(input: HTMLInputElement, watts: number) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, String(watts));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function release(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('LoadWidget', () => {
  it('keeps the readout and track markers on the thumb while dragging', () => {
    const view = renderWidget();
    const marker = () => view.querySelector('li circle')!.getAttribute('cx');
    const before = marker();

    for (const watts of [600, 650, 720]) drag(slider(view), watts);

    expect(readout(view)).toMatch(/^720 W/u);
    expect(slider(view).getAttribute('aria-valuetext')).toMatch(/^720 W/u);
    expect(Number(marker())).toBeGreaterThan(Number(before));
    expect(Number(marker())).toBeCloseTo((720 / 1000) * 136, 1);
  });

  it('writes the URL and analytics once the drag is released, not on every step', () => {
    const view = renderWidget();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    vi.mocked(track).mockClear();

    for (const watts of [600, 650, 720]) drag(slider(view), watts);

    expect(replaceState).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(window.location.hash).toContain('ld=570');

    release(slider(view));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toContain('ld=720');
    expect(window.location.hash).toContain('hw=b200');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('powerx_tutorial_load_watts', { value: 720 });
  });

  it('still eases a chip switch', () => {
    const view = renderWidget();
    const itWatts = () => view.querySelector('[data-testid="powerx-load-context"]')!.textContent;
    const before = itWatts();

    act(() => hardwareStore.set('gb200'));

    // Frames are held, so an eased switch still shows the old chip's IT watts.
    expect(frames.length).toBeGreaterThan(0);
    expect(itWatts()).toContain(before!.split('· ')[1]);
  });
});
