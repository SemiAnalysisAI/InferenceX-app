import type * as d3 from 'd3';

import { writeAttrs } from '../chart-update';
import type { ContinuousScale } from '../types';

export interface HorizontalBarConfig<T> {
  getY: (d: T) => string;
  getX: (d: T) => number;
  getColor: (d: T) => string;
  /** Stack start in data units (default 0), for stacked segments. */
  getX0?: (d: T) => number;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  opacity?: number;
  /** Per-bar overrides of `stroke`, `opacity` and the dash pattern. */
  getStroke?: (d: T) => string;
  getStrokeDasharray?: (d: T) => string | null;
  getOpacity?: (d: T) => number;
  /** Extra attributes per bar (data-*, aria-*). */
  getAttrs?: (d: T) => Record<string, string | number | undefined>;
  keyFn?: (d: T) => string;
}

function barX<T>(xScale: ContinuousScale, getX0: ((d: T) => number) | undefined, d: T): number {
  return getX0 ? xScale(getX0(d)) : 0;
}

function barWidth<T>(
  xScale: ContinuousScale,
  getX: (d: T) => number,
  getX0: ((d: T) => number) | undefined,
  d: T,
): number {
  if (!getX0) return Math.max(0, xScale(getX(d)));
  const x0 = getX0(d);
  return Math.max(0, xScale(x0 + getX(d)) - xScale(x0));
}

function writeExtraAttrs<T>(
  bars: d3.Selection<SVGRectElement, T, SVGGElement, unknown>,
  config: HorizontalBarConfig<T>,
): void {
  const { getStrokeDasharray, getAttrs } = config;
  if (getStrokeDasharray) writeAttrs(bars, { 'stroke-dasharray': (d) => getStrokeDasharray(d) });
  if (getAttrs) {
    bars.each(function (d) {
      for (const [name, value] of Object.entries(getAttrs(d))) {
        if (value === undefined) this.removeAttribute(name);
        else if (this.getAttribute(name) !== String(value)) this.setAttribute(name, String(value));
      }
    });
  }
}

export function renderHorizontalBars<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  yScale: d3.ScaleBand<string>,
  xScale: ContinuousScale,
  config: HorizontalBarConfig<T>,
): d3.Selection<SVGRectElement, T, SVGGElement, unknown> {
  const bars = group.selectAll<SVGRectElement, T>('.bar').data(data, config.keyFn).join('rect');
  const { getStroke, getOpacity, getX0 } = config;
  const result = writeAttrs(bars, {
    class: 'bar',
    x: getX0 ? (d) => barX(xScale, getX0, d) : 0,
    y: (d) => yScale(config.getY(d)) || 0,
    width: (d) => barWidth(xScale, config.getX, getX0, d),
    height: yScale.bandwidth(),
    fill: (d) => config.getColor(d),
    stroke: getStroke ? (d) => getStroke(d) : (config.stroke ?? 'none'),
    'stroke-width': config.strokeWidth ?? 0,
    rx: config.rx ?? 2,
    opacity: getOpacity ? (d) => getOpacity(d) : (config.opacity ?? 0.85),
    cursor: 'pointer',
  });
  writeExtraAttrs(result, config);
  return result;
}

export function updateHorizontalBarsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: ContinuousScale,
  getX: (d: T) => number,
  getX0?: (d: T) => number,
): void {
  const bars = group.selectAll<SVGRectElement, T>('.bar');
  if (getX0) {
    writeAttrs(bars, {
      x: (d) => barX(xScale, getX0, d),
      width: (d) => barWidth(xScale, getX, getX0, d),
    });
    return;
  }
  writeAttrs(bars, {
    width: (d) => Math.max(0, xScale(getX(d))),
  });
}

export function updateHorizontalBarsForDisplay<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  config: HorizontalBarConfig<T>,
): void {
  const { getStroke, getOpacity } = config;
  const bars = group.selectAll<SVGRectElement, T>('.bar');
  writeAttrs(bars, {
    fill: (d) => config.getColor(d),
    stroke: getStroke ? (d) => getStroke(d) : (config.stroke ?? 'none'),
    'stroke-width': config.strokeWidth ?? 0,
  });
  if (getOpacity) writeAttrs(bars, { opacity: (d) => getOpacity(d) });
  writeExtraAttrs(bars, config);
}
