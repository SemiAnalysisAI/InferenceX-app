import type * as d3 from 'd3';

import { writeAttrs } from '../chart-update';

export interface ErrorBarConfig<T> {
  getCx: (d: T) => number;
  getYMin: (d: T) => number;
  getYMax: (d: T) => number;
  capWidth: number;
  stroke: string;
  strokeWidth?: number;
}

export function renderErrorBars<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  config: ErrorBarConfig<T>,
): d3.Selection<SVGGElement, T, SVGGElement, unknown> {
  const selection = group.selectAll<SVGGElement, T>('.error-bar').data(data);
  const sw = config.strokeWidth ?? 1;

  const entered = selection.enter().append('g').attr('class', 'error-bar');
  entered
    .append('line')
    .attr('class', 'eb-stem')
    .attr('stroke', config.stroke)
    .attr('stroke-width', sw);
  entered
    .append('line')
    .attr('class', 'eb-cap-top')
    .attr('stroke', config.stroke)
    .attr('stroke-width', sw);
  entered
    .append('line')
    .attr('class', 'eb-cap-bot')
    .attr('stroke', config.stroke)
    .attr('stroke-width', sw);

  selection.exit().remove();

  const merged = entered.merge(selection);

  writeAttrs(merged.select<SVGLineElement>('.eb-stem'), {
    x1: (d) => config.getCx(d),
    x2: (d) => config.getCx(d),
    y1: (d) => config.getYMax(d),
    y2: (d) => config.getYMin(d),
    stroke: config.stroke,
  });
  writeAttrs(merged.select<SVGLineElement>('.eb-cap-top'), {
    x1: (d) => config.getCx(d) - config.capWidth / 2,
    x2: (d) => config.getCx(d) + config.capWidth / 2,
    y1: (d) => config.getYMax(d),
    y2: (d) => config.getYMax(d),
    stroke: config.stroke,
  });
  writeAttrs(merged.select<SVGLineElement>('.eb-cap-bot'), {
    x1: (d) => config.getCx(d) - config.capWidth / 2,
    x2: (d) => config.getCx(d) + config.capWidth / 2,
    y1: (d) => config.getYMin(d),
    y2: (d) => config.getYMin(d),
    stroke: config.stroke,
  });

  return merged;
}

export function updateErrorBarsOnZoom<T>(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  config: ErrorBarConfig<T>,
): void {
  const bars = group.selectAll<SVGGElement, T>('.error-bar');

  writeAttrs(bars.select<SVGLineElement>('.eb-stem'), {
    x1: (d) => config.getCx(d),
    x2: (d) => config.getCx(d),
    y1: (d) => config.getYMax(d),
    y2: (d) => config.getYMin(d),
  });
  writeAttrs(bars.select<SVGLineElement>('.eb-cap-top'), {
    x1: (d) => config.getCx(d) - config.capWidth / 2,
    x2: (d) => config.getCx(d) + config.capWidth / 2,
    y1: (d) => config.getYMax(d),
    y2: (d) => config.getYMax(d),
  });
  writeAttrs(bars.select<SVGLineElement>('.eb-cap-bot'), {
    x1: (d) => config.getCx(d) - config.capWidth / 2,
    x2: (d) => config.getCx(d) + config.capWidth / 2,
    y1: (d) => config.getYMin(d),
    y2: (d) => config.getYMin(d),
  });
}
