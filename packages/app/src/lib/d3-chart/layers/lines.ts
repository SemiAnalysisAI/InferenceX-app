import * as d3 from 'd3';

import type { ContinuousScale } from '../types';

type AnyXScale = ContinuousScale | d3.ScaleTime<number, number>;

export interface LineConfig {
  getColor: (key: string) => string;
  getStrokeDasharray?: (key: string) => string;
  strokeWidth?: number;
  getStrokeWidth?: (key: string) => number;
  curve?: d3.CurveFactory;
  isDefined?: (d: { x: number; y: number }) => boolean;
}

interface LineEntry {
  key: string;
  points: { x: number; y: number }[];
}

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

  const entered = selection.enter().append('path').attr('class', 'line-path').attr('fill', 'none');

  selection.exit().remove();

  entered
    .merge(selection)
    .attr('data-line-key', (d) => d.key)
    .attr('stroke', (d) => config.getColor(d.key))
    .attr('stroke-dasharray', (d) => config.getStrokeDasharray?.(d.key) ?? null)
    .attr('stroke-width', (d) => config.getStrokeWidth?.(d.key) ?? config.strokeWidth ?? 2)
    .attr('d', (d) => lineGenerator(d.points));
}

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

  // Keys are data (e.g. "Huawei 950PR"), so match the attribute instead of building a selector.
  group.selectAll<SVGPathElement, unknown>('.line-path').each(function () {
    const key = this.dataset.lineKey ?? '';
    if (Object.hasOwn(lines, key)) d3.select(this).datum(lines[key]).attr('d', lineGenerator);
  });
}
