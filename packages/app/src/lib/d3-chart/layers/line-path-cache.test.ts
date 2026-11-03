// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { projectedLinePath } from './line-path-cache';

const points = () => [
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 2 },
  { x: 3, y: 5 },
];

const skipsX1 = (point: { x: number; y: number }) => point.x !== 1;
const skipsX2 = (point: { x: number; y: number }) => point.x !== 2;

let curveCalls = 0;
const countingCurve: d3.CurveFactory = (context) => {
  curveCalls++;
  return d3.curveLinear(context);
};

function reference(
  data: { x: number; y: number }[],
  x: d3.ScaleLinear<number, number>,
  y: d3.ScaleLinear<number, number>,
  curve: d3.CurveFactory,
  isDefined?: (point: { x: number; y: number }) => boolean,
) {
  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => x(d.x))
    .y((d) => y(d.y))
    .curve(curve);
  if (isDefined) line.defined(isDefined);
  return line(data);
}

describe('projectedLinePath', () => {
  const x = d3.scaleLinear().domain([0, 3]).range([0, 300]);
  const y = d3.scaleLinear().domain([0, 5]).range([100, 0]);

  it('matches d3.line for the same points, scales, curve and gaps', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    expect(projectedLinePath(element, points(), x, y, d3.curveMonotoneX)).toBe(
      reference(points(), x, y, d3.curveMonotoneX),
    );
    expect(projectedLinePath(element, points(), x, y, d3.curveLinear, skipsX2)).toBe(
      reference(points(), x, y, d3.curveLinear, skipsX2),
    );
  });

  it('reuses the previous path only while every projected coordinate is unchanged', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const data = points();
    const callsBefore = curveCalls;
    const first = projectedLinePath(element, data, x, y, countingCurve);
    expect(projectedLinePath(element, points(), x, y, countingCurve)).toBe(first);
    expect(curveCalls - callsBefore).toBe(1);
    expect(projectedLinePath(element, data, x, y, d3.curveLinear)).toBe(
      reference(data, x, y, d3.curveLinear),
    );

    data[3].y = 4;
    expect(projectedLinePath(element, data, x, y, d3.curveLinear)).toBe(
      reference(data, x, y, d3.curveLinear),
    );

    const zoomed = x.copy().domain([0, 2]);
    expect(projectedLinePath(element, data, zoomed, y, d3.curveLinear)).toBe(
      reference(data, zoomed, y, d3.curveLinear),
    );
    expect(projectedLinePath(element, data.slice(0, 3), zoomed, y, d3.curveLinear)).toBe(
      reference(data.slice(0, 3), zoomed, y, d3.curveLinear),
    );
    expect(projectedLinePath(element, data, zoomed, y, d3.curveLinear)).toBe(
      reference(data, zoomed, y, d3.curveLinear),
    );
  });

  it('regenerates when the curve or the defined mask changes', () => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    projectedLinePath(element, points(), x, y, d3.curveLinear);
    expect(projectedLinePath(element, points(), x, y, d3.curveStep)).toBe(
      reference(points(), x, y, d3.curveStep),
    );
    expect(projectedLinePath(element, points(), x, y, d3.curveStep, skipsX1)).toBe(
      reference(points(), x, y, d3.curveStep, skipsX1),
    );
    expect(projectedLinePath(element, points(), x, y, d3.curveStep, skipsX2)).toBe(
      reference(points(), x, y, d3.curveStep, skipsX2),
    );
    expect(projectedLinePath(element, points(), x, y, d3.curveStep)).toBe(
      reference(points(), x, y, d3.curveStep),
    );
  });

  it('keeps a separate cache per element', () => {
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    projectedLinePath(a, points(), x, y, d3.curveLinear);
    const shifted = points().map((point) => ({ ...point, y: point.y + 1 }));
    expect(projectedLinePath(b, shifted, x, y, d3.curveLinear)).toBe(
      reference(shifted, x, y, d3.curveLinear),
    );
  });
});
