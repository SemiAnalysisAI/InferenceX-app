import * as d3 from 'd3';

import { setAttrIfChanged, writeAttrs } from '../chart-update';
import type { ContinuousScale } from '../types';

import { projectedLinePath } from './line-path-cache';

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
  const project = xScale as d3.ScaleLinear<number, number>;
  const curve = config.curve ?? d3.curveMonotoneX;

  const entries: LineEntry[] = Object.entries(lines)
    .filter(([, points]) => points.length > 0)
    .map(([key, points]) => ({ key, points }));

  const selection = group
    .selectAll<SVGPathElement, LineEntry>('.line-path')
    .data(entries, (d) => d.key);

  const entered = selection.enter().append('path').attr('fill', 'none');

  selection.exit().remove();

  writeAttrs(entered.merge(selection), {
    class: (d) => `line-path line-${d.key}`,
    'data-line-key': (d) => d.key,
    stroke: (d) => config.getColor(d.key),
    'stroke-dasharray': (d) => config.getStrokeDasharray?.(d.key) ?? null,
    'stroke-width': (d) => config.getStrokeWidth?.(d.key) ?? config.strokeWidth ?? 2,
  }).each(function (d) {
    writeLinePath(
      this,
      projectedLinePath(this, d.points, project, yScale, curve, config.isDefined),
    );
  });
}

export function updateLinesOnZoom(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  lines: Record<string, { x: number; y: number }[]>,
  xScale: AnyXScale,
  yScale: ContinuousScale,
  config?: Pick<LineConfig, 'curve' | 'isDefined'>,
): void {
  const project = xScale as d3.ScaleLinear<number, number>;
  const curve = config?.curve ?? d3.curveMonotoneX;

  group.selectAll<SVGPathElement, unknown>('.line-path').each(function () {
    const key = this.dataset.lineKey ?? '';
    if (!Object.hasOwn(lines, key)) return;
    const points = lines[key];
    d3.select(this).datum(points);
    writeLinePath(this, projectedLinePath(this, points, project, yScale, curve, config?.isDefined));
  });
}

function writeLinePath(element: SVGPathElement, path: string | null): void {
  if (path === null) element.removeAttribute('d');
  else setAttrIfChanged(element, 'd', path);
}
