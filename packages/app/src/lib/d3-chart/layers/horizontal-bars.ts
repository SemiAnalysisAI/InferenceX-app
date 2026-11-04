import type * as d3 from 'd3';

import { writeAttrs } from '../chart-update';
import type { ContinuousScale } from '../types';

export interface HorizontalBarConfig<T> {
  getY: (d: T) => string;
  getX: (d: T) => number;
  getColor: (d: T) => string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  opacity?: number;
  keyFn?: (d: T) => string;
}

export function renderHorizontalBars<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  yScale: d3.ScaleBand<string>,
  xScale: ContinuousScale,
  config: HorizontalBarConfig<T>,
): d3.Selection<SVGRectElement, T, SVGGElement, unknown> {
  const bars = group.selectAll<SVGRectElement, T>('.bar').data(data, config.keyFn).join('rect');
  return writeAttrs(bars, {
    class: 'bar',
    x: 0,
    y: (d) => yScale(config.getY(d)) || 0,
    width: (d) => Math.max(0, xScale(config.getX(d))),
    height: yScale.bandwidth(),
    fill: (d) => config.getColor(d),
    stroke: config.stroke ?? 'none',
    'stroke-width': config.strokeWidth ?? 0,
    rx: config.rx ?? 2,
    opacity: config.opacity ?? 0.85,
    cursor: 'pointer',
  });
}

export function updateHorizontalBarsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: ContinuousScale,
  getX: (d: T) => number,
): void {
  writeAttrs(group.selectAll<SVGRectElement, T>('.bar'), {
    width: (d) => Math.max(0, xScale(getX(d))),
  });
}

export function updateHorizontalBarsForDisplay<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  config: HorizontalBarConfig<T>,
): void {
  writeAttrs(group.selectAll<SVGRectElement, T>('.bar'), {
    fill: (d) => config.getColor(d),
    stroke: config.stroke ?? 'none',
    'stroke-width': config.strokeWidth ?? 0,
  });
}
