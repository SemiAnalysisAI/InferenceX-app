// @vitest-environment jsdom
import { scaleLinear, scaleLog, select } from 'd3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChartLayout } from '@/lib/d3-chart/types';

import {
  axesBetween,
  capturePlot,
  easeAxes,
  placeGrid,
  restAxes,
  sameAxes,
  settlePlot,
  stopAxes,
  type AxisState,
} from './chart-motion';
import { MOTION } from './motion';

const SVG = 'http://www.w3.org/2000/svg';

/** A plot group with the points and lines the shared layers would have drawn. */
function plot(points: Record<string, string>, lines: string[] = []) {
  const root = document.createElementNS(SVG, 'g');
  for (const key of lines) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('class', `line-path line-${key}`);
    path.dataset.lineKey = key;
    root.append(path);
  }
  for (const [key, transform] of Object.entries(points)) {
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('class', 'dot-group');
    group.setAttribute('transform', transform);
    group.dataset.point = key;
    group.dataset.overlay = String(key.startsWith('overlay'));
    const shape = document.createElementNS(SVG, 'circle');
    shape.setAttribute('class', 'visible-shape');
    group.append(shape);
    root.append(group);
  }
  document.body.append(root);
  return root;
}

interface Fade {
  node: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
}

/** Records each Web Animations call, with a handle that ends it. */
function recordAnimations(): Fade[] {
  const fades: Fade[] = [];
  Element.prototype.animate = function animate(
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const listeners: Record<string, (() => void)[]> = {};
    fades.push({
      node: this,
      frames,
      options,
      finish: () => listeners.finish?.forEach((f) => f()),
    });
    return {
      addEventListener: (type: string, listener: () => void) =>
        (listeners[type] ??= []).push(listener),
      cancel: () => listeners.cancel?.forEach((f) => f()),
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
  return fades;
}

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(Element.prototype, 'animate');
  vi.useRealTimers();
});

describe('settlePlot', () => {
  it('keeps the node of a point that stays, so the plot glides it instead of redrawing it', () => {
    const fades = recordAnimations();
    const root = plot({ a: 'translate(10,10)', b: 'translate(20,20)' }, ['b200']);
    const kept = root.querySelector('[data-point="a"]');
    const before = capturePlot(root);
    // The filter change: b leaves, c arrives, a moves.
    root.querySelector('[data-point="b"]')!.remove();
    kept!.setAttribute('transform', 'translate(40,10)');
    const added = plot({ c: 'translate(5,5)' }).firstElementChild!;
    root.append(added);
    settlePlot(root, before, true);

    expect(root.querySelector('[data-point="a"]')).toBe(kept);
    expect(fades.map((fade) => fade.node)).not.toContain(kept);
    // What left fades out where it was, no longer a point: taps, labels and tests pass it by.
    const exit = root.querySelector('.plot-exits > .plot-exit')!;
    expect(exit.getAttribute('transform')).toBe('translate(20,20)');
    expect(Object.hasOwn((exit as SVGElement).dataset, 'point')).toBe(false);
    expect(root.querySelectorAll('.dot-group')).toHaveLength(2);
    expect(root.querySelector('.plot-exits .visible-shape')).toBeNull();
    const out = fades.find((fade) => fade.node === exit)!;
    expect(out.frames).toEqual([{ opacity: 0 }]);
    expect(out.options.duration).toBe(MOTION.fast);
    out.finish();
    expect(root.querySelector('.plot-exit')).toBeNull();
    // What arrived fades in.
    const fresh = fades.find((fade) => fade.node === added)!;
    expect(fresh.frames).toEqual([{ opacity: 0, offset: 0 }]);
    expect(fresh.options.duration).toBe(MOTION.base);
  });

  it('treats a named run overlay point like any other', () => {
    const fades = recordAnimations();
    const root = plot({ 'overlay-1': 'translate(10,10)', 'overlay-2': 'translate(30,30)' });
    const kept = root.querySelector('[data-point="overlay-1"]');
    const before = capturePlot(root);
    root.querySelector('[data-point="overlay-2"]')!.remove();
    settlePlot(root, before, true);
    expect(root.querySelector('[data-point="overlay-1"]')).toBe(kept);
    expect(root.querySelectorAll('.plot-exit')).toHaveLength(1);
    expect(fades).toHaveLength(1);
  });

  it('fades lines in and out with their points', () => {
    const fades = recordAnimations();
    const root = plot({ a: 'translate(10,10)' }, ['b200', 'h100']);
    const before = capturePlot(root);
    root.querySelector('[data-line-key="h100"]')!.remove();
    const added = plot({}, ['h200']).firstElementChild!;
    root.prepend(added);
    settlePlot(root, before, true);
    expect(root.querySelector('.plot-exits > path.plot-exit')).not.toBeNull();
    expect(root.querySelectorAll('.line-path')).toHaveLength(2);
    expect(fades.map((fade) => fade.node)).toContain(added);
  });

  it('does not fade in the first plot', () => {
    const fades = recordAnimations();
    const root = plot({});
    const before = capturePlot(root);
    root.append(plot({ a: 'translate(1,1)' }).firstElementChild!);
    settlePlot(root, before, false);
    expect(fades).toHaveLength(0);
  });

  it('drops what left at once where the browser cannot animate', () => {
    const root = plot({ a: 'translate(10,10)', b: 'translate(20,20)' });
    const before = capturePlot(root);
    root.querySelector('[data-point="b"]')!.remove();
    settlePlot(root, before, true);
    expect(root.querySelector('.plot-exit')).toBeNull();
  });
});

const axes = (x: [number, number], y: [number, number], log = false): AxisState => ({
  x: (log ? scaleLog() : scaleLinear()).domain(x).range([0, 400]),
  y: scaleLinear().domain(y).range([200, 0]),
  width: 400,
  height: 200,
  config: { xTickCount: 4, yTickCount: 4 },
});

function layout(): ChartLayout {
  const svg = select(document.body).append('svg');
  const g = svg.append('g');
  return {
    svg,
    g,
    zoomGroup: g.append('g'),
    xAxisGroup: g.append('g').attr('class', 'x-axis'),
    yAxisGroup: g.append('g').attr('class', 'y-axis'),
    gridGroup: g.append('g').attr('class', 'grid'),
    width: 400,
    height: 200,
  } as unknown as ChartLayout;
}

const tickAt = (chart: ChartLayout, value: number) =>
  chart.xAxisGroup
    .selectAll<SVGGElement, number>('.tick')
    .filter((tick) => tick === value)
    .attr('transform');

describe('axes', () => {
  beforeEach(() => vi.stubGlobal('devicePixelRatio', 2));
  afterEach(() => vi.unstubAllGlobals());

  it('knows when two renders put every value in the same place', () => {
    expect(sameAxes(axes([0, 100], [0, 50]), axes([0, 100], [0, 50]))).toBe(true);
    expect(sameAxes(axes([0, 100], [0, 50]), axes([0, 200], [0, 50]))).toBe(false);
    expect(sameAxes(axes([0, 100], [0, 50]), axes([0, 100], [0, 80]))).toBe(false);
    expect(sameAxes(axes([1, 100], [0, 50]), axes([1, 100], [0, 50], true))).toBe(false);
  });

  it('starts the ticks where they were and leaves them where they belong', () => {
    const chart = layout();
    const from = axes([0, 100], [0, 50]);
    const to = axes([0, 200], [0, 50]);
    restAxes(chart, from);
    expect(tickAt(chart, 100)).toBe('translate(400,0)');
    easeAxes(chart, from, to);
    // Still where the reader last saw it: the move has only been scheduled.
    expect(tickAt(chart, 100)).toBe('translate(400,0)');
    expect('__transition' in chart.xAxisGroup.node()!).toBe(true);
    restAxes(chart, to);
    expect(tickAt(chart, 100)).toBe('translate(200,0)');
    expect('__transition' in chart.xAxisGroup.node()!).toBe(false);
  });

  it('ends on the last of two quick changes, with nothing left running', () => {
    const chart = layout();
    const first = axes([0, 100], [0, 50]);
    const second = axes([0, 200], [0, 50]);
    const third = axes([0, 50], [0, 50]);
    restAxes(chart, first);
    easeAxes(chart, first, second);
    // The second change arrives mid-move: it starts from in between, never from either end.
    const seen = axesBetween(first, second, 0.5);
    expect((seen.x as (value: number) => number)(100)).toBeCloseTo(300, 6);
    easeAxes(chart, seen, third);
    expect(tickAt(chart, 50)).toBe('translate(150,0)');
    stopAxes(chart);
    restAxes(chart, third);
    expect(tickAt(chart, 50)).toBe('translate(400,0)');
    const running = [chart.xAxisGroup, chart.yAxisGroup].flatMap((group) =>
      [group.node()!, ...group.selectAll('*').nodes()].filter((node) => '__transition' in node!),
    );
    expect(running).toHaveLength(0);
    // Ticks of the first two scales that the last one has no place for are gone.
    expect(chart.xAxisGroup.selectAll('.tick').data()).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('has no scale in between a linear and a log axis, so the move starts from the last target', () => {
    const to = axes([1, 100], [0, 50], true);
    expect(axesBetween(axes([0, 100], [0, 50]), to, 0.5)).toBe(to);
  });

  it('places the grid part of the way, and hides a line that is still outside the plot', () => {
    const chart = layout();
    chart.gridGroup
      .append('g')
      .attr('class', 'grid-v')
      .selectAll('line')
      .data([50, 150])
      .join('line');
    chart.gridGroup.append('g').attr('class', 'grid-h').selectAll('line').data([25]).join('line');
    const from = axes([0, 100], [0, 50]);
    const to = axes([0, 200], [0, 100]);
    const lines = () => chart.gridGroup.selectAll<SVGLineElement, number>('.grid-v line').nodes();
    placeGrid(chart, from, to, 0.5);
    // 50 was at 200 px and goes to 100 px; 150 comes in from 600 px, outside, on its way to 300 px.
    expect(lines().map((line) => line.getAttribute('x1'))).toEqual(['150', '450']);
    expect(lines().map((line) => line.style.visibility)).toEqual(['', 'hidden']);
    placeGrid(chart, from, to, 1);
    expect(lines().map((line) => line.getAttribute('x2'))).toEqual(['100', '300']);
    expect(lines().map((line) => line.style.visibility)).toEqual(['', '']);
    expect(chart.gridGroup.select('.grid-h line').attr('y1')).toBe('150');
  });
});
