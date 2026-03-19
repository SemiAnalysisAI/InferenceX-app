import * as d3 from 'd3';

import type { ContinuousScale } from '../types';

export interface RooflineConfig {
  getColor: (key: string) => string;
  getOpacity?: (key: string) => number;
  isVisible?: (key: string) => boolean;
  strokeWidth?: number;
  strokeDasharray?: string;
}

interface RooflineEntry<T> {
  key: string;
  points: T[];
}

/**
 * Render Pareto frontier rooflines as monotone spline paths.
 * Uses enter/update/exit for DOM reuse.
 */
export function renderRooflines<T extends { x: number; y: number }>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  rooflines: Record<string, T[]>,
  xScale: ContinuousScale,
  yScale: ContinuousScale,
  config: RooflineConfig,
): void {
  const { getColor, getOpacity, isVisible, strokeWidth = 2, strokeDasharray } = config;
  const lineGenerator = d3
    .line<T>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(d3.curveMonotoneX);

  const entries: RooflineEntry<T>[] = Object.entries(rooflines)
    .filter(([key, points]) => points.length >= 2 && (!isVisible || isVisible(key)))
    .map(([key, points]) => ({ key, points }));

  const selection = zoomGroup
    .selectAll<SVGPathElement, RooflineEntry<T>>('.roofline-path')
    .data(entries, (d) => d.key);

  // Enter
  const entered = selection
    .enter()
    .append('path')
    .attr('class', (d) => `roofline-path roofline-${d.key}`)
    .attr('fill', 'none');

  // Exit
  selection.exit().remove();

  // Update all
  const merged = entered.merge(selection);
  merged
    .attr('class', (d) => `roofline-path roofline-${d.key}`)
    .attr('stroke', (d) => getColor(d.key))
    .attr('stroke-width', strokeWidth)
    .attr('d', (d) => lineGenerator(d.points) ?? '');

  if (strokeDasharray) {
    merged.attr('stroke-dasharray', strokeDasharray);
  }

  merged.each(function (d) {
    const el = d3.select(this);
    const opacity = getOpacity?.(d.key);
    if (opacity !== undefined) {
      el.style('opacity', opacity);
    }
  });
}

/** Update roofline paths on zoom with new scales. */
export function updateRooflinesOnZoom<T extends { x: number; y: number }>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  rooflines: Record<string, T[]>,
  newXScale: ContinuousScale,
  newYScale: ContinuousScale,
): void {
  const lineGenerator = d3
    .line<T>()
    .x((d) => newXScale(d.x))
    .y((d) => newYScale(d.y))
    .curve(d3.curveMonotoneX);

  Object.entries(rooflines).forEach(([key, points]) => {
    if (points.length < 2) return;
    const selection = zoomGroup.select<SVGPathElement>(`.roofline-${key}`);
    if (!selection.empty()) {
      selection.attr('d', lineGenerator(points) as string);
    }
  });
}
