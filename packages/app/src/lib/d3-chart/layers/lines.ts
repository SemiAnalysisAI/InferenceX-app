import * as d3 from 'd3';

import type { ContinuousScale } from '../types';

type AnyXScale = ContinuousScale | d3.ScaleTime<number, number>;

export interface LineConfig {
  getColor: (key: string) => string;
  strokeWidth?: number;
  curve?: d3.CurveFactory;
  /** Return false to create gaps in the line (e.g., missing data points). */
  isDefined?: (d: { x: number; y: number }) => boolean;
}

interface LineEntry {
  key: string;
  points: { x: number; y: number }[];
}

/** Render multiple keyed line paths using enter/update/exit. */
export function renderLines(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  lines: Record<string, { x: number; y: number }[]>,
  xScale: AnyXScale,
  yScale: ContinuousScale,
  config: LineConfig,
): void {
  const lineGenerator = d3
    .line<{ x: number; y: number }>()
    .x((d) => (xScale as d3.ScaleLinear<number, number>)(d.x))
    .y((d) => yScale(d.y))
    .curve(config.curve ?? d3.curveMonotoneX);

  if (config.isDefined) {
    lineGenerator.defined(config.isDefined);
  }

  const entries: LineEntry[] = Object.entries(lines)
    .filter(([, points]) => points.length > 0)
    .map(([key, points]) => ({ key, points }));

  const selection = group
    .selectAll<SVGPathElement, LineEntry>('.line-path')
    .data(entries, (d) => d.key);

  // Enter
  const entered = selection
    .enter()
    .append('path')
    .attr('class', (d) => `line-path line-${d.key}`)
    .attr('fill', 'none');

  // Exit
  selection.exit().remove();

  // Update all
  entered
    .merge(selection)
    .attr('class', (d) => `line-path line-${d.key}`)
    .attr('stroke', (d) => config.getColor(d.key))
    .attr('stroke-width', config.strokeWidth ?? 2)
    .attr('d', (d) => lineGenerator(d.points));
}

/** Update line paths on zoom (recompute d attribute). */
export function updateLinesOnZoom(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  lines: Record<string, { x: number; y: number }[]>,
  xScale: AnyXScale,
  yScale: ContinuousScale,
  config?: Pick<LineConfig, 'curve' | 'isDefined'>,
): void {
  const lineGenerator = d3
    .line<{ x: number; y: number }>()
    .x((d) => (xScale as d3.ScaleLinear<number, number>)(d.x))
    .y((d) => yScale(d.y))
    .curve(config?.curve ?? d3.curveMonotoneX);

  if (config?.isDefined) {
    lineGenerator.defined(config.isDefined);
  }

  for (const [key, points] of Object.entries(lines)) {
    group.select(`.line-${key}`).datum(points).attr('d', lineGenerator);
  }
}
