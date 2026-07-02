// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import type { ShapeKey } from '@/lib/chart-rendering';

import { computeTooltipPosition, renderScatterPoints, syncPointShape } from './scatter-points';

interface TestPoint {
  hwKey: string;
  precision: string;
  x: number;
  y: number;
  tp: number;
}

const POINTS: TestPoint[] = [
  { hwKey: 'h100', precision: 'fp8', x: 10, y: 100, tp: 8 },
  { hwKey: 'h100', precision: 'fp4', x: 20, y: 200, tp: 8 },
  { hwKey: 'mi300x', precision: 'fp8', x: 30, y: 300, tp: 4 },
];

function makeZoomGroup() {
  const svg = d3.create('svg:svg');
  return svg.append('g') as d3.Selection<SVGGElement, unknown, null, undefined>;
}

const xScale = d3.scaleLinear().domain([0, 100]).range([0, 800]);
const yScale = d3.scaleLinear().domain([0, 400]).range([600, 0]);

const keyFn = (d: TestPoint) => `${d.hwKey}|${d.precision}`;

describe('renderScatterPoints with getShapeKey', () => {
  it('resolves shapes through the accessor', () => {
    const group = makeZoomGroup();
    renderScatterPoints(
      group,
      POINTS,
      xScale,
      yScale,
      {
        getColor: () => '#123456',
        getShapeKey: (d) => (d.precision === 'fp8' ? 'circle' : 'square'),
      },
      keyFn,
    );

    const shapes = group.selectAll<SVGElement, TestPoint>('.visible-shape').nodes();
    expect(shapes).toHaveLength(3);
    expect(shapes.map((n) => n.tagName.toLowerCase()).toSorted()).toEqual([
      'circle',
      'circle',
      'rect',
    ]);
    const fp4Shape = group
      .selectAll<SVGGElement, TestPoint>('.dot-group')
      .filter((d) => d.precision === 'fp4')
      .select<SVGElement>('.visible-shape');
    expect(fp4Shape.attr('data-shape-key')).toBe('square');
  });

  it('swaps shape elements in place when the accessor result changes', () => {
    const group = makeZoomGroup();
    // Single selected precision: everything is a circle.
    const shapeState: { fp4: ShapeKey } = { fp4: 'circle' };
    const config = {
      getColor: () => '#123456',
      getShapeKey: (d: TestPoint) => (d.precision === 'fp4' ? shapeState.fp4 : 'circle'),
    };

    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);
    expect(
      group
        .selectAll<SVGElement, TestPoint>('.visible-shape')
        .nodes()
        .every((n) => n.tagName.toLowerCase() === 'circle'),
    ).toBe(true);

    // Second precision selected: fp4 points become squares. Same config
    // object — the accessor reads current state, mirroring the ref-based
    // accessors ScatterGraph passes so a precision toggle doesn't have to
    // recreate the layer config.
    shapeState.fp4 = 'square';
    renderScatterPoints(group, POINTS, xScale, yScale, config, keyFn);

    const dotGroups = group.selectAll<SVGGElement, TestPoint>('.dot-group');
    expect(dotGroups.size()).toBe(3); // reused, not recreated
    const fp4Shape = dotGroups
      .filter((d) => d.precision === 'fp4')
      .select<SVGElement>('.visible-shape');
    expect(fp4Shape.node()!.tagName.toLowerCase()).toBe('rect');
    expect(fp4Shape.attr('data-shape-key')).toBe('square');
  });

  it('falls back to selectedPrecisions ordering when no accessor is given', () => {
    const group = makeZoomGroup();
    renderScatterPoints(
      group,
      POINTS,
      xScale,
      yScale,
      {
        getColor: () => '#123456',
        selectedPrecisions: ['fp8', 'fp4'],
      },
      keyFn,
    );

    const byPrecision = (precision: string) =>
      group
        .selectAll<SVGGElement, TestPoint>('.dot-group')
        .filter((d) => d.precision === precision)
        .select<SVGElement>('.visible-shape')
        .attr('data-shape-key');
    expect(byPrecision('fp8')).toBe('circle');
    expect(byPrecision('fp4')).toBe('square');
  });
});

describe('syncPointShape', () => {
  function makeDotGroup() {
    const group = makeZoomGroup();
    return group.append('g').attr('class', 'dot-group') as d3.Selection<
      SVGGElement,
      unknown,
      null,
      undefined
    >;
  }

  it('creates the shape element when missing', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const shape = g.select<SVGElement>('.visible-shape');
    expect(shape.empty()).toBe(false);
    expect(shape.node()!.tagName.toLowerCase()).toBe('circle');
    expect(shape.attr('fill')).toBe('#ff0000');
    expect(shape.attr('data-shape-key')).toBe('circle');
  });

  it('updates fill in place when the shape type is unchanged', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const node = g.select<SVGElement>('.visible-shape').node();

    syncPointShape(g, 'circle', '#00ff00');
    const shape = g.select<SVGElement>('.visible-shape');
    expect(shape.node()).toBe(node); // same element, no swap
    expect(shape.attr('fill')).toBe('#00ff00');
  });

  it('swaps the element when the shape type changes', () => {
    const g = makeDotGroup();
    syncPointShape(g, 'circle', '#ff0000');
    const before = g.select<SVGElement>('.visible-shape').node();

    syncPointShape(g, 'square', '#ff0000');
    const after = g.select<SVGElement>('.visible-shape');
    expect(after.node()).not.toBe(before);
    expect(after.node()!.tagName.toLowerCase()).toBe('rect');
    expect(after.attr('data-shape-key')).toBe('square');
    // Only one visible shape remains.
    expect(g.selectAll('.visible-shape').size()).toBe(1);
  });
});

describe('computeTooltipPosition', () => {
  it('keeps a tall pinned tooltip inside the visible viewport', () => {
    const tooltipNode = document.createElement('div');
    document.body.append(tooltipNode);
    Object.defineProperty(tooltipNode, 'getBoundingClientRect', {
      value: () => ({
        width: 300,
        height: 400,
        left: 0,
        top: 0,
        right: 300,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
      getBoundingClientRect: {
        value: () => ({
          width: 800,
          height: 600,
          left: 100,
          top: 600,
          right: 900,
          bottom: 1200,
          x: 100,
          y: 600,
          toJSON: () => ({}),
        }),
      },
    });
    Object.defineProperties(document.documentElement, {
      clientWidth: { configurable: true, value: 1280 },
      clientHeight: { configurable: true, value: 720 },
    });

    expect(computeTooltipPosition(450, 100, d3.select(tooltipNode), container)).toEqual({
      left: 560,
      top: 316,
    });
  });
});
