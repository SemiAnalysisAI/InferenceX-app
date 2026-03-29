import * as d3 from 'd3';

import type { ChartLayout, ContinuousScale } from './types';

/** A scale that can be either continuous (linear/log), banded, or time-based. */
export type AnyScale = ContinuousScale | d3.ScaleBand<string> | d3.ScaleTime<number, number>;

export interface AxisUpdateConfig {
  xTickFormat?: (d: d3.AxisDomain) => string;
  yTickFormat?: (d: d3.AxisDomain) => string;
  xTickCount?: number;
  yTickCount?: number;
  /** Override tick size for Y axis (default: 6, use 0 for band scales). */
  yTickSize?: number;
  /** When set, axes animate to new positions over this duration (ms). */
  transitionDuration?: number;
}

/** Render or update axes with current scales. */
export function renderAxes(
  layout: ChartLayout,
  xScale: AnyScale,
  yScale: ContinuousScale | d3.ScaleBand<string>,
  config: AxisUpdateConfig,
): void {
  const { xTickFormat, yTickFormat, xTickCount, yTickCount, yTickSize, transitionDuration } =
    config;
  const dur = transitionDuration ?? 0;

  // X axis
  let xAxisGen: d3.Axis<d3.AxisDomain>;
  if ('bandwidth' in xScale) {
    xAxisGen = d3
      .axisBottom(xScale as d3.ScaleBand<string>)
      .tickSize(6) as unknown as d3.Axis<d3.AxisDomain>;
  } else {
    const gen = d3.axisBottom(xScale as ContinuousScale).tickSize(6);
    if (xTickCount) gen.ticks(xTickCount);
    if (xTickFormat) gen.tickFormat(xTickFormat as any);
    xAxisGen = gen as unknown as d3.Axis<d3.AxisDomain>;
  }

  const xTarget = dur > 0 ? layout.xAxisGroup.transition().duration(dur) : layout.xAxisGroup;
  (xTarget as any).call(xAxisGen as any);

  // Y axis
  if ('bandwidth' in yScale) {
    const bandAxisGen = d3
      .axisLeft(yScale as d3.ScaleBand<string>)
      .tickSize(yTickSize ?? 0) as unknown as d3.Axis<d3.AxisDomain>;
    const yBandTarget = dur > 0 ? layout.yAxisGroup.transition().duration(dur) : layout.yAxisGroup;
    (yBandTarget as any).call(bandAxisGen as any);
  } else {
    const yAxisGen = d3.axisLeft(yScale as ContinuousScale).tickSize(yTickSize ?? 6);
    if (yTickCount) yAxisGen.ticks(yTickCount);
    if (yTickFormat) yAxisGen.tickFormat(yTickFormat as any);
    const yTarget = dur > 0 ? layout.yAxisGroup.transition().duration(dur) : layout.yAxisGroup;
    (yTarget as any).call(yAxisGen as any);
  }
}

/** Render or update grid lines with current scales. */
export function renderGrid(
  layout: ChartLayout,
  xScale: AnyScale,
  yScale: ContinuousScale | d3.ScaleBand<string>,
  yTickCount?: number,
  transitionDuration?: number,
): void {
  const { width, height, gridGroup } = layout;
  const dur = transitionDuration ?? 0;

  // Vertical grid lines — reuse existing group, join updates lines in place
  let vGroup = gridGroup.select<SVGGElement>('.grid-v');
  if (vGroup.empty()) vGroup = gridGroup.append('g').attr('class', 'grid-v');

  if ('bandwidth' in xScale) {
    const bandScale = xScale as d3.ScaleBand<string>;
    vGroup
      .selectAll<SVGLineElement, string>('line')
      .data(bandScale.domain())
      .join('line')
      .attr('x1', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
      .attr('x2', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
      .attr('y1', 0)
      .attr('y2', height);
  } else {
    const tickScale = xScale as { ticks: (count?: number) => number[]; (v: number): number };
    const xTicks = tickScale.ticks();
    const vJoin = vGroup
      .selectAll<SVGLineElement, number>('line')
      .data(xTicks)
      .join(
        (enter) =>
          enter
            .append('line')
            .attr('y1', 0)
            .attr('y2', height)
            .attr('x1', (d) => tickScale(d))
            .attr('x2', (d) => tickScale(d)),
        (update) => update,
        (exit) => exit.remove(),
      );
    const vTarget = dur > 0 ? (vJoin as any).transition().duration(dur) : vJoin;
    vTarget
      .attr('x1', (d: number) => tickScale(d))
      .attr('x2', (d: number) => tickScale(d))
      .attr('y1', 0)
      .attr('y2', height);
  }

  // Horizontal grid lines — reuse existing group
  let hGroup = gridGroup.select<SVGGElement>('.grid-h');
  if (hGroup.empty()) hGroup = gridGroup.append('g').attr('class', 'grid-h');

  if ('bandwidth' in yScale) {
    const bandScale = yScale as d3.ScaleBand<string>;
    hGroup
      .selectAll<SVGLineElement, string>('line')
      .data(bandScale.domain())
      .join('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
      .attr('y2', (d) => (bandScale(d) || 0) + bandScale.bandwidth() / 2)
      .style('stroke-width', 0.5);
  } else {
    const yTicks = yScale.ticks(yTickCount ?? 5);
    const hJoin = hGroup
      .selectAll<SVGLineElement, number>('line')
      .data(yTicks)
      .join(
        (enter) =>
          enter
            .append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', (d) => yScale(d))
            .attr('y2', (d) => yScale(d)),
        (update) => update,
        (exit) => exit.remove(),
      );
    const hTarget = dur > 0 ? (hJoin as any).transition().duration(dur) : hJoin;
    hTarget
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', (d: number) => yScale(d))
      .attr('y2', (d: number) => yScale(d));
  }
}
