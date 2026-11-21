// @test-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import {
  advanceTimersByTime,
  mocked,
  stubGlobal,
  unstubAllGlobals,
  useFakeTimers,
  useRealTimers,
} from '@/test/helpers';

import type { RequestTimeline } from '@/hooks/api/use-request-timeline';
import { track } from '@/lib/analytics/analytics';

import { RequestTimelineView } from './request-timeline';

mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
mock.module('next/navigation', () => ({
  usePathname: () => '/infx/inference/agentic',
  useRouter: () => ({ push: vi.fn() }),
}));

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });

const data: RequestTimeline = {
  version: 1,
  startNs: 0,
  endNs: 2_000_000_000,
  durationS: 2,
  requests: [
    {
      cid: 'conversation-1',
      ti: 0,
      wid: 'worker-1',
      ad: 0,
      phase: 'profiling',
      credit: 0,
      start: 0,
      ack: null,
      end: 2_000_000_000,
      ttftMs: null,
      tpotMs: null,
      isl: null,
      osl: null,
      cancelled: false,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;
let mounted: boolean;

function timelineSvg() {
  const svg = container.querySelector('[data-testid="request-timeline-svg"]');
  if (!svg) throw new Error('timeline svg not rendered');
  return svg;
}

function shiftWheel(deltaY: number) {
  act(() => {
    timelineSvg().dispatchEvent(
      new WheelEvent('wheel', { deltaY, shiftKey: true, bubbles: true, cancelable: true }),
    );
  });
}

function doubleClick() {
  act(() => {
    timelineSvg().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
}

beforeEach(() => {
  useFakeTimers();
  stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root.render(<RequestTimelineView data={data} pointId={1} />));
  mounted = true;
});

afterEach(() => {
  if (mounted) act(() => root.unmount());
  useRealTimers();
  unstubAllGlobals();
  mocked(track).mockClear();
});

describe('RequestTimelineView zoom tracking', () => {
  it('sends one zoom event per Shift+wheel gesture', () => {
    shiftWheel(100);
    shiftWheel(100);
    act(() => advanceTimersByTime(500));
    expect(mocked(track).mock.calls).toEqual([
      ['inference_agentic_timeline_zoomed', { direction: 'out' }],
    ]);
  });

  it('drops a pending zoom event when the timeline unmounts first', () => {
    shiftWheel(-100);
    act(() => advanceTimersByTime(200));
    act(() => root.unmount());
    mounted = false;
    advanceTimersByTime(1000);
    expect(track).not.toHaveBeenCalled();
  });

  it('ignores a double-click reset while the timeline is not zoomed', () => {
    doubleClick();
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks a double-click reset after zooming in', () => {
    shiftWheel(-100);
    act(() => advanceTimersByTime(500));
    mocked(track).mockClear();
    doubleClick();
    expect(mocked(track).mock.calls).toEqual([
      ['inference_agentic_timeline_zoom_reset', { placement: 'double_click' }],
    ]);
  });
});
