// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { D3Chart } from './D3Chart';
import type { D3ChartProps } from './types';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Datum {
  key: string;
  x: number;
  y: number;
}

const DATA: Datum[] = [
  { key: 'a', x: 1, y: 10 },
  { key: 'b', x: 2, y: 40 },
  { key: 'c', x: 3, y: 25 },
  { key: 'd', x: 4, y: 35 },
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

function draw(props: D3ChartProps<Datum>) {
  act(() => root.render(createElement(D3Chart<Datum>, props)));
  flushFrames();
}

function zoomIn() {
  const svg = container.querySelector('svg')!;
  act(() => {
    svg.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -300,
        shiftKey: true,
        clientX: 200,
        clientY: 100,
        bubbles: true,
      }),
    );
  });
  flushFrames();
}

function recordMutations(run: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {});
  observer.observe(container, { subtree: true, attributes: true, childList: true });
  run();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}

function barChart(color: string): D3ChartProps<Datum> {
  return {
    chartId: 'zoom-restore-bars',
    data: DATA,
    height: 400,
    xScale: { type: 'band', domain: DATA.map((d) => d.key), padding: 0.2 },
    yScale: { type: 'linear', domain: [0, 50] },
    layers: [
      {
        type: 'bar',
        data: DATA,
        config: {
          getX: (d) => d.key,
          getY: (d) => d.y,
          getColor: () => color,
          getForeground: () => 'white',
        },
      },
      {
        type: 'barLabel',
        data: DATA,
        config: {
          getX: (d) => d.key,
          getY: (d) => d.y,
          getLabel: (d) => String(d.y),
          foreground: 'black',
        },
      },
    ],
    zoom: { enabled: true, axes: 'y' },
  };
}

function lineChart(
  tooltip: D3ChartProps<Datum>['tooltip'],
  rooflineKey = 'frontier',
): D3ChartProps<Datum> {
  return {
    chartId: 'zoom-restore-lines',
    data: DATA,
    height: 400,
    xScale: { type: 'linear', domain: [0, 5] },
    yScale: { type: 'linear', domain: [0, 50] },
    layers: [
      {
        type: 'point',
        data: DATA,
        config: {
          getCx: () => 0,
          getCy: () => 0,
          getX: (d) => d.x,
          getY: (d) => d.y,
          getColor: () => 'red',
        },
      },
      { type: 'roofline', rooflines: { [rooflineKey]: DATA }, config: { getColor: () => 'blue' } },
    ],
    zoom: { enabled: true, axes: 'both' },
    tooltip,
  };
}

const proximityTooltip = {
  rulerType: 'vertical' as const,
  proximityHover: true,
  getDataX: (d: Datum) => d.x,
  content: (d: Datum) => d.key,
};

describe('D3Chart data phase while zoomed', () => {
  it('draws zoom-owned layers at the restored zoom so the replayed transform writes nothing', () => {
    draw(barChart('red'));
    zoomIn();
    const zoomedBars = [...container.querySelectorAll('.bar')].map((bar) => bar.outerHTML);

    const records = recordMutations(() => draw(barChart('red')));

    expect(
      records.filter((record) => (record.target as Element).matches('.bar, .bar-label')),
    ).toHaveLength(0);
    expect([...container.querySelectorAll('.bar')].map((bar) => bar.outerHTML)).toEqual(zoomedBars);
  });

  it('zooms point positions on both axes', () => {
    draw(lineChart(undefined));
    const point = container.querySelector('.point')!;
    const [cx, cy] = [point.getAttribute('cx'), point.getAttribute('cy')];
    zoomIn();
    expect(point.getAttribute('cx')).not.toBe(cx);
    expect(point.getAttribute('cy')).not.toBe(cy);
  });

  it('leaves roofline geometry to its zoom handler', () => {
    draw(lineChart(undefined, 'two words'));
    const basePath = container.querySelector('.roofline-path')!.getAttribute('d');
    zoomIn();
    draw(lineChart(undefined, 'two words'));
    expect(container.querySelector('.roofline-path')!.getAttribute('d')).toBe(basePath);
  });
});

describe('D3Chart proximity overlay', () => {
  it('keeps one overlay and stops moving raised marks once the rulers exist', () => {
    draw(lineChart(proximityTooltip));
    draw(lineChart(proximityTooltip));
    const records = recordMutations(() => draw(lineChart(proximityTooltip)));

    expect(container.querySelectorAll('.proximity-overlay')).toHaveLength(1);
    const moved = records.flatMap((record) => [...record.addedNodes]);
    expect(moved.every((node) => (node as Element).matches('.proximity-overlay'))).toBe(true);
    expect(
      container.querySelector('.zoom-group')!.lastElementChild!.matches('.proximity-overlay'),
    ).toBe(true);
  });

  it('is only created when proximity hover is requested', () => {
    draw(lineChart({ ...proximityTooltip, proximityHover: false }));
    expect(container.querySelectorAll('.proximity-overlay')).toHaveLength(0);
  });
});
