import * as d3 from 'd3';
import { type RefObject, useEffect } from 'react';

import { setAttrIfChanged, widthTickCount } from './chart-update';
import type { D3ChartHandle } from './D3Chart/types';
import type { ChartLayout } from './types';

/** Height of the x-axis band at the top of a tall chart. Reserve it plus 4px as the top margin. */
export const TOP_AXIS_BAND_PX = 28;

/**
 * Draw an x-axis above the plot that `stickTopAxis` pins under the site header while the plot
 * scrolls past, so a tall row chart keeps its scale in view.
 */
export function renderTopAxis(
  layout: ChartLayout,
  xScale: d3.ScaleLinear<number, number>,
  options: {
    tickCount: number;
    tickFormat: (value: d3.AxisDomain) => string;
    tickValues?: number[];
  },
) {
  let axis = layout.g.select<SVGGElement>('.x-axis-top');
  if (axis.empty()) {
    axis = layout.g.append('g').attr('class', 'x-axis-top').style('pointer-events', 'none');
    axis
      .append('rect')
      .attr('class', 'x-axis-top-band')
      .attr('fill', 'var(--card)')
      .attr('opacity', 0);
    axis
      .append('line')
      .attr('class', 'x-axis-top-edge')
      .attr('stroke', 'var(--chart-grid)')
      .attr('opacity', 0);
    axis.append('g').attr('class', 'x-axis-top-ticks');
  }
  const generator = d3
    .axisTop(xScale)
    .ticks(widthTickCount(layout.width, options.tickCount))
    .tickFormat(options.tickFormat)
    .tickSize(0)
    .tickPadding(8);
  if (options.tickValues) generator.tickValues(options.tickValues);
  axis.attr('data-plot-top', layout.margin.top).attr('data-plot-height', layout.height);
  axis
    .select('.x-axis-top-band')
    .attr('x', -layout.margin.left)
    .attr('y', -TOP_AXIS_BAND_PX)
    .attr('width', layout.width + layout.margin.left + layout.margin.right)
    .attr('height', TOP_AXIS_BAND_PX + 4);
  axis
    .select('.x-axis-top-edge')
    .attr('x1', -layout.margin.left)
    .attr('x2', layout.width + layout.margin.right)
    .attr('y1', 4.5)
    .attr('y2', 4.5);
  axis
    .select<SVGGElement>('.x-axis-top-ticks')
    .call(generator)
    .call((ticks) => ticks.select('.domain').remove());
}

export function stickTopAxis(svg: SVGSVGElement | null | undefined) {
  const axis = svg?.querySelector<SVGGElement>('.x-axis-top');
  if (!svg || !axis) return;
  const headerBottom =
    document.querySelector('.vt-site-header')?.getBoundingClientRect().bottom ?? 0;
  const plotTop = svg.getBoundingClientRect().top + Number(axis.dataset.plotTop);
  const maxOffset = Math.max(0, Number(axis.dataset.plotHeight) - TOP_AXIS_BAND_PX);
  const offset = Math.min(maxOffset, Math.max(0, headerBottom + TOP_AXIS_BAND_PX - plotTop));
  setAttrIfChanged(axis, 'transform', `translate(0,${offset})`);
  const opacity = offset > 0 ? '1' : '0';
  for (const el of axis.querySelectorAll('.x-axis-top-band, .x-axis-top-edge'))
    setAttrIfChanged(el, 'opacity', opacity);
}

/** An exported image shows the top axis at rest above the plot. */
export function unstickTopAxis(layout: ChartLayout) {
  const axis = layout.g.select('.x-axis-top').attr('transform', null);
  axis.selectAll('.x-axis-top-band, .x-axis-top-edge').attr('opacity', 0);
}

/** Re-pin the top axis on every scroll and resize frame. */
export function useStickyTopAxis(chartRef: RefObject<D3ChartHandle | null>) {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stickTopAxis(chartRef.current?.getSvgElement());
      });
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [chartRef]);
}
