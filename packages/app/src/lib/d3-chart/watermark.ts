import * as d3 from 'd3';

import type { ChartMargin } from './types';

/** Create a centered logo watermark pattern. */
export function createLogoWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  containerWidth: number,
  containerHeight: number,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
): void {
  const logoSize = Math.min(innerWidth, innerHeight) * 0.6;
  defs
    .append('pattern')
    .attr('id', 'logo-pattern')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .append('image')
    .attr('href', '/logo.png')
    .attr('width', logoSize)
    .attr('height', logoSize)
    .attr('x', margin.left + (innerWidth - logoSize) / 2)
    .attr('y', margin.top + (innerHeight - logoSize) / 2)
    .attr('opacity', 0.1);

  svg
    .insert('rect', ':first-child')
    .attr('class', 'watermark-rect')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .attr('fill', 'url(#logo-pattern)');
}

/** Create a diagonal repeating "UNOFFICIAL" watermark pattern. */
export function createUnofficialWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  containerWidth: number,
  containerHeight: number,
): void {
  const patternSize = 200;
  const pattern = defs
    .append('pattern')
    .attr('id', 'unofficial-pattern')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', patternSize)
    .attr('height', patternSize)
    .attr('patternTransform', 'rotate(-45)');

  pattern
    .append('text')
    .attr('x', patternSize / 2)
    .attr('y', patternSize / 2)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', '#dc2626')
    .attr('font-size', '24px')
    .attr('font-weight', 'bold')
    .attr('opacity', 0.15)
    .text('UNOFFICIAL');

  svg
    .insert('rect', ':first-child')
    .attr('class', 'watermark-rect')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .attr('fill', 'url(#unofficial-pattern)');
}
