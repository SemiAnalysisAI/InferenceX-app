import * as d3 from 'd3';

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

/** Render vertical bars using D3 enter/update/exit. */
export function renderBars<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  xScale: d3.ScaleBand<string>,
  yScale: ContinuousScale,
  height: number,
  config: BarConfig<T>,
): d3.Selection<SVGRectElement, T, SVGGElement, unknown> {
  return group
    .selectAll<SVGRectElement, T>('.bar')
    .data(data, config.keyFn)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', (d) => xScale(config.getX(d)) || 0)
    .attr('y', (d) => yScale(config.getY(d)))
    .attr('width', xScale.bandwidth())
    .attr('height', (d) => height - yScale(config.getY(d)))
    .attr('fill', (d) => config.getColor(d))
    .attr('stroke', config.stroke ?? 'none')
    .attr('stroke-width', config.strokeWidth ?? 0)
    .attr('rx', config.rx ?? 2)
    .attr('cursor', 'pointer');
}

/** Update bar positions on zoom (Y-only rescale). */
export function updateBarsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  yScale: ContinuousScale,
  height: number,
  getY: (d: T) => number,
): void {
  group
    .selectAll<SVGRectElement, T>('.bar')
    .attr('y', (d) => yScale(getY(d)))
    .attr('height', (d) => height - yScale(getY(d)));
}
