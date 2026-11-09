// @vitest-environment jsdom
import { select } from 'd3';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HOVER_POINT_SIZE, POINT_SIZE } from '@/lib/charts/chart-rendering';
import { stubMatchMedia } from '@/test/match-media-stub';
import { renderChartForExport } from '../export-renderer';
import { overlayMarkerPosition } from '../overlay-x-marker';
import { CANVAS_POINT_LAYER_SELECTOR, POINT_HIT_AREA_CLASS } from '../layers/canvas-point-registry';
import { type CanvasPointLayerElement, ensureCanvasPointLayer } from '../layers/canvas-points';
import { installRecordingContext } from '../layers/canvas-points-test-utils';
import type { ContinuousScale } from '../types';
import { D3Chart } from './D3Chart';
import type { D3ChartProps } from './types';

vi.mock('@/lib/d3-chart/dynamic-margins', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTextWidth: (text: string, font: string) =>
    text.length * Number.parseFloat(font.split(' ')[1]) * 0.58,
}));

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

let frames: FrameRequestCallback[] = [];
let container: HTMLDivElement;
let root: Root;

function flushFrames() {
  while (frames.length > 0) {
    const pending = frames;
    frames = [];
    for (const frame of pending) frame(0);
  }
}

beforeEach(() => {
  frames = [];
  stubMatchMedia();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', () => {});
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
  vi.unstubAllGlobals();
});

function chart(canvas: boolean): D3ChartProps<Datum> {
  return {
    chartId: 'pin-rulers',
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
      details: (d) => createElement('p', null, d.id),
      getRulerX: (d, scale) => (scale as ContinuousScale)(d.x),
      getRulerY: (d, scale) => scale(d.y),
    },
  };
}

function draw(props: D3ChartProps<Datum>) {
  act(() => root.render(createElement(D3Chart<Datum>, props)));
  flushFrames();
}

function zoomIn(clientX: number, clientY: number) {
  act(() => {
    container
      .querySelector('svg')!
      .dispatchEvent(
        new WheelEvent('wheel', { deltaY: -300, shiftKey: true, clientX, clientY, bubbles: true }),
      );
  });
  flushFrames();
}

function windowMouseEvent(type: string, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
  Object.defineProperty(event, 'view', { value: window });
  return event;
}

async function pan() {
  const svg = container.querySelector('svg')!;
  act(() => {
    svg.dispatchEvent(windowMouseEvent('mousedown', 300, 200));
    window.dispatchEvent(windowMouseEvent('mousemove', 240, 170));
    window.dispatchEvent(windowMouseEvent('mouseup', 240, 170));
    svg.dispatchEvent(windowMouseEvent('click', 240, 170));
  });
  flushFrames();
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await promise;
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  flushFrames();
}

function pinMarks(scope: ParentNode = container) {
  const rulers = scope.querySelector<SVGGElement>('.ruler-group')!;
  return {
    shown: rulers.style.display !== 'none',
    x: Number(rulers.querySelector('.vertical-ruler')!.getAttribute('x1')),
    y: Number(rulers.querySelector('.horizontal-ruler')!.getAttribute('y1')),
    ring: scope.querySelector('.pin-ring')?.getAttribute('transform') ?? null,
  };
}

function canvasPoint(id: string) {
  return container.querySelector<CanvasPointLayerElement>(CANVAS_POINT_LAYER_SELECTOR)!
    .scatterPoints!().find((point) => point.key === id)!;
}

function drawnRadius(calls: unknown[][], x: number, y: number): unknown {
  const frame = calls.slice(calls.findLastIndex((call) => call[0] === 'clearRect'));
  const at = frame.findIndex(
    (call) =>
      call[0] === 'setTransform' &&
      Math.abs(Number(call[5]) - x) < 1e-6 &&
      Math.abs(Number(call[6]) - y) < 1e-6,
  );
  const fill = frame.slice(at).find((call) => call[0] === 'fill') as [string, unknown[][]];
  return fill[1][0][3];
}

function hitArea(type: string, point: { clientX: number; clientY: number }) {
  act(() => {
    container
      .querySelector(`.${POINT_HIT_AREA_CLASS}`)!
      .dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientX: point.clientX, clientY: point.clientY }),
      );
  });
  flushFrames();
}

describe('D3Chart pinned point', () => {
  it('keeps the rulers and the hover-size canvas dot on the pinned point through zoom and pan', async () => {
    const calls = installRecordingContext();
    draw(chart(true));
    const pinned = canvasPoint('b');
    hitArea('mousemove', pinned);
    hitArea('click', pinned);
    hitArea('mouseleave', pinned);

    expect(pinMarks()).toEqual({
      shown: true,
      x: pinned.x,
      y: pinned.y,
      ring: `translate(${pinned.x},${pinned.y})`,
    });
    expect(drawnRadius(calls, pinned.x, pinned.y)).toBe(HOVER_POINT_SIZE);

    zoomIn(pinned.clientX + 40, pinned.clientY + 20);
    await pan();
    const moved = canvasPoint('b');
    expect([moved.x, moved.y]).not.toEqual([pinned.x, pinned.y]);
    expect(pinMarks()).toEqual({
      shown: true,
      x: moved.x,
      y: moved.y,
      ring: `translate(${moved.x},${moved.y})`,
    });
    expect(drawnRadius(calls, moved.x, moved.y)).toBe(HOVER_POINT_SIZE);
    const other = canvasPoint('d');
    expect(drawnRadius(calls, other.x, other.y)).toBe(POINT_SIZE);

    hitArea('mousemove', other);
    expect(document.querySelector<HTMLElement>('[data-chart-tooltip]')!.textContent).toBe('d');
    expect(pinMarks()).toMatchObject({ shown: true, x: moved.x, y: moved.y });
    hitArea('mouseleave', other);

    pressEscape();
    expect(pinMarks()).toMatchObject({ shown: false, ring: null });
    expect(drawnRadius(calls, moved.x, moved.y)).toBe(POINT_SIZE);
  });

  it('keeps SVG dots enlarged under the rulers through zoom', () => {
    draw(chart(false));
    const dot = () =>
      [...container.querySelectorAll<SVGGElement>('.dot-group')].find(
        (group) => group.querySelector('.visible-shape') && group.getAttribute('transform'),
      )!;
    const radius = () => dot().querySelector('.visible-shape')!.getAttribute('r');
    const before = overlayMarkerPosition(dot())!;
    act(() => {
      dot().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(pinMarks()).toMatchObject({ shown: true, x: before.x, y: before.y });
    expect(radius()).toBe(String(HOVER_POINT_SIZE));

    zoomIn(before.x, before.y + 30);
    const after = overlayMarkerPosition(dot())!;
    expect(after).not.toEqual(before);
    expect(pinMarks()).toEqual({
      shown: true,
      x: after.x,
      y: after.y,
      ring: `translate(${after.x},${after.y})`,
    });
    expect(radius()).toBe(String(HOVER_POINT_SIZE));

    pressEscape();
    expect(pinMarks()).toMatchObject({ shown: false, ring: null });
    expect(radius()).toBe(String(POINT_SIZE));
  });

  it('draws the pinned point at hover size with its rulers and ring in the PNG export', () => {
    installRecordingContext();
    draw(chart(true));
    const pinned = canvasPoint('b');
    hitArea('click', pinned);
    zoomIn(pinned.clientX + 40, pinned.clientY + 20);

    const svg = container.querySelector('svg')!;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    document.body.append(clone);
    renderChartForExport(svg, clone, 1000, 500);
    const dot = (id: string) =>
      [...clone.querySelectorAll<SVGGElement>('.dot-group')].find(
        (group) => select<SVGGElement, Datum>(group).datum().id === id,
      )!;
    const exported = overlayMarkerPosition(dot('b'))!;

    expect(exported.x).not.toBe(canvasPoint('b').x);
    expect(pinMarks(clone)).toEqual({
      shown: true,
      x: exported.x,
      y: exported.y,
      ring: `translate(${exported.x},${exported.y})`,
    });
    expect(dot('b').querySelector('.visible-shape')!.getAttribute('r')).toBe(
      String(HOVER_POINT_SIZE),
    );
    expect(dot('d').querySelector('.visible-shape')!.getAttribute('r')).toBe(String(POINT_SIZE));
    clone.remove();
  });
});
