// @test-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import { ZOOM_CLICK_DISTANCE_PX } from '@/hooks/useChartZoom';
import { stubMatchMedia } from '@/test/match-media-stub';
import { CANVAS_POINT_LAYER_SELECTOR, POINT_HIT_AREA_CLASS } from '../layers/canvas-point-registry';
import { type CanvasPointLayerElement, ensureCanvasPointLayer } from '../layers/canvas-points';
import { installRecordingContext } from '../layers/canvas-points-test-utils';
import type { ContinuousScale } from '../types';
import { isChartZoomed } from '../zoom-state';
import { D3Chart } from './D3Chart';
import type { D3ChartProps } from './types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Datum {
  id: string;
  precision: string;
  x: number;
  y: number;
}

const DATA: Datum[] = [
  { id: 'a', precision: 'fp8', x: 1, y: 10 },
  { id: 'b', precision: 'fp8', x: 2.5, y: 30 },
  { id: 'c', precision: 'fp8', x: 4, y: 20 },
  { id: 'd', precision: 'fp8', x: 3, y: 25 },
];

const CHART_ID = 'repin';
const RESET_EVENT = `d3chart_zoom_reset_${CHART_ID}`;

let frames: FrameRequestCallback[] = [];
let container: HTMLDivElement;
let root: Root;

function flushFrames() {
  act(() => {
    while (frames.length > 0) {
      const pending = frames;
      frames = [];
      for (const frame of pending) frame(0);
    }
  });
}

beforeEach(() => {
  frames = [];
  stubMatchMedia();
  stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ width: 800, height: 400 }),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  unstubAllGlobals();
});

function chart(canvas: boolean): D3ChartProps<Datum> {
  return {
    chartId: CHART_ID,
    data: DATA,
    height: 400,
    xScale: { type: 'linear', domain: [0, 5] },
    yScale: { type: 'linear', domain: [0, 50] },
    layers: [
      {
        type: 'scatter',
        key: 'points',
        data: DATA,
        config: { getColor: () => 'red' },
        keyFn: (d) => d.id,
        ...(canvas ? { canvas: ensureCanvasPointLayer } : {}),
      },
    ],
    zoom: { enabled: true, axes: 'both' },
    tooltip: {
      rulerType: 'crosshair',
      content: (d) => d.id,
      details: (d) => createElement('p', null, `details ${d.id}`),
      getRulerX: (d, scale) => (scale as ContinuousScale)(d.x),
      getRulerY: (d, scale) => scale(d.y),
    },
  };
}

function draw(props: D3ChartProps<Datum>) {
  act(() => root.render(createElement(D3Chart<Datum>, props)));
  flushFrames();
}

function canvasPoint(id: string) {
  return container.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)!
    .scatterPoints!().find((point) => point.key === id)!;
}

/** A mouse event whose `view` is the window, as d3-zoom and d3-drag read it. */
function mouseEvent(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true, button: 0 });
  Object.defineProperty(event, 'view', { value: window });
  return event;
}

const hitArea = () => container.querySelector(`.${POINT_HIT_AREA_CLASS}`)!;

function clickPoint(point: { clientX: number; clientY: number }) {
  act(() => {
    hitArea().dispatchEvent(mouseEvent('click', point.clientX, point.clientY));
  });
  flushFrames();
}

/** Presses on a point, drifts `dx` pixels, releases and clicks where the pointer ended. */
function dragClick(point: { clientX: number; clientY: number }, dx: number) {
  const endX = point.clientX + dx;
  act(() => {
    hitArea().dispatchEvent(mouseEvent('mousedown', point.clientX, point.clientY));
    window.dispatchEvent(mouseEvent('mousemove', endX, point.clientY));
    window.dispatchEvent(mouseEvent('mouseup', endX, point.clientY));
    hitArea().dispatchEvent(mouseEvent('click', endX, point.clientY));
  });
  flushFrames();
}

const details = () =>
  container.querySelector('[data-slot="chart-details-frame"]')?.textContent ?? null;
const ring = () => container.querySelector('.pin-ring')?.getAttribute('transform') ?? null;
/** Clicks the first SVG dot, which the non-canvas scatter layer draws as its own target. */
function clickSvgDot() {
  act(() => {
    [...container.querySelectorAll<SVGGElement>('.dot-group')]
      .find((group) => group.querySelector('.visible-shape'))!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  flushFrames();
}

describe('D3Chart pinned point re-click', () => {
  it('keeps the details panel open when the pinned canvas point is clicked again', () => {
    installRecordingContext();
    draw(chart(true));
    const pinned = canvasPoint('b');

    clickPoint(pinned);
    expect(details()).toBe('details b');
    expect(ring()).toBe(`translate(${pinned.x},${pinned.y})`);

    clickPoint(pinned);
    expect(details()).toBe('details b');
    expect(ring()).toBe(`translate(${pinned.x},${pinned.y})`);

    const other = canvasPoint('d');
    clickPoint(other);
    expect(details()).toBe('details d');
  });

  it('keeps the details panel open when a pinned SVG dot is clicked again', () => {
    draw(chart(false));

    clickSvgDot();
    const pinnedDetails = details();
    expect(pinnedDetails).toMatch(/^details [a-d]$/u);
    clickSvgDot();
    expect(details()).toBe(pinnedDetails);
    expect(ring()).not.toBeNull();
  });
});

describe('D3Chart point clicks with pointer drift', () => {
  it(`pins a point when the pointer drifts less than ${ZOOM_CLICK_DISTANCE_PX}px between press and release`, () => {
    installRecordingContext();
    draw(chart(true));
    const point = canvasPoint('b');

    dragClick(point, ZOOM_CLICK_DISTANCE_PX - 1);

    expect(details()).toBe('details b');
    expect(isChartZoomed(RESET_EVENT)).toBe(false);
  });

  it('treats a longer drag as a pan, so the click does not pin', () => {
    installRecordingContext();
    draw(chart(true));
    const point = canvasPoint('b');

    dragClick(point, 40);

    expect(details()).toBeNull();
  });
});

describe('D3Chart zoom state for the reset button', () => {
  it('reports the chart as zoomed after a zoom and clears it when the chart unmounts', async () => {
    installRecordingContext();
    draw(chart(true));
    expect(isChartZoomed(RESET_EVENT)).toBe(false);

    await act(async () => {
      container.querySelector('svg')!.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -300,
          shiftKey: true,
          clientX: 300,
          clientY: 200,
          bubbles: true,
        }),
      );
      // The zoomed axes re-measure the zoom hint from a MutationObserver microtask.
      await Promise.resolve();
      flushFrames();
    });
    expect(isChartZoomed(RESET_EVENT)).toBe(true);

    act(() => root.unmount());
    expect(isChartZoomed(RESET_EVENT)).toBe(false);
    root = createRoot(container);
  });
});
