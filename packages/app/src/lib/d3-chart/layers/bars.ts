import type * as d3 from 'd3';

import { writeAttrs } from '../chart-update';
import type { ContinuousScale } from '../types';

export interface BarConfig<T> {
  getX: (d: T) => string;
  getY: (d: T) => number;
  getColor: (d: T) => string;
  getForeground: (d: T) => string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  keyFn?: (d: T) => string;
}

export function renderBars<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  xScale: d3.ScaleBand<string>,
  yScale: ContinuousScale,
  height: number,
  config: BarConfig<T>,
): d3.Selection<SVGRectElement, T, SVGGElement, unknown> {
  const bars = group.selectAll<SVGRectElement, T>('.bar').data(data, config.keyFn).join('rect');
  return writeAttrs(bars, {
    class: 'bar',
    x: (d) => xScale(config.getX(d)) || 0,
    y: (d) => yScale(config.getY(d)),
    width: xScale.bandwidth(),
    height: (d) => height - yScale(config.getY(d)),
    fill: (d) => config.getColor(d),
    stroke: config.stroke ?? 'none',
    'stroke-width': config.strokeWidth ?? 0,
    rx: config.rx ?? 2,
    cursor: 'pointer',
  });
}

export function updateBarsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: ContinuousScale,
  height: number,
  getY: (d: T) => number,
): void {
  writeAttrs(group.selectAll<SVGRectElement, T>('.bar'), {
    y: (d) => yScale(getY(d)),
    height: (d) => height - yScale(getY(d)),
  });
}
