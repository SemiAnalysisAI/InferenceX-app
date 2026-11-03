import type * as d3 from 'd3';

import { writeAttrs, writeText } from '../chart-update';
import type { ContinuousScale } from '../types';

export interface BarLabelConfig<T> {
  getX: (d: T) => string;
  getY: (d: T) => number;
  getLabel: (d: T) => string;
  foreground: string;
}

export function renderBarLabels<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  xScale: d3.ScaleBand<string>,
  yScale: ContinuousScale,
  height: number,
  config: BarLabelConfig<T>,
): void {
  const selection = group.selectAll<SVGTextElement, T>('.bar-label').data(data);

  const entered = selection.enter().append('text').attr('class', 'bar-label');

  selection.exit().remove();

  const labels = writeAttrs(entered.merge(selection), {
    x: (d) => (xScale(config.getX(d)) || 0) + xScale.bandwidth() / 2,
    y: (d) => {
      const barHeight = height - yScale(config.getY(d));
      return yScale(config.getY(d)) + barHeight / 2;
    },
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    transform: (d) => {
      const cx = (xScale(config.getX(d)) || 0) + xScale.bandwidth() / 2;
      const barHeight = height - yScale(config.getY(d));
      const cy = yScale(config.getY(d)) + barHeight / 2;
      return `rotate(-90, ${cx}, ${cy})`;
    },
    fill: config.foreground,
    'font-size': (d) => {
      const barHeight = height - yScale(config.getY(d));
      return `${Math.min(Math.max(barHeight * 0.3, 8), 14)}px`;
    },
    'font-weight': '600',
    'pointer-events': 'none',
  });
  writeText(labels, (d) => config.getLabel(d));
}

export function updateBarLabelsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  xScale: d3.ScaleBand<string>,
  yScale: ContinuousScale,
  height: number,
  config: BarLabelConfig<T>,
): void {
  renderBarLabels(group, data, xScale, yScale, height, config);
}
