import type * as d3 from 'd3';

import type { ChartMargin } from './types';

/** Insert the watermark backing rect, masked to the inner chart area. */
function insertWatermarkRect(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
  patternId: string,
): void {
  svg
    .insert('rect', ':first-child')
    .attr('class', 'watermark-rect')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', `url(#${patternId})`);
}

/** Create a centered logo watermark pattern. */
export function createLogoWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  containerWidth: number,
  containerHeight: number,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
  chartId: string,
): void {
  const patternId = `logo-pattern-${chartId}`;
  const logoSize = Math.min(innerWidth, innerHeight) * 0.6;
  defs
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', containerWidth)
    .attr('height', containerHeight)
    .append('image')
    .attr('href', '/brand/logo-color.webp')
    .attr('width', logoSize)
    .attr('height', logoSize)
    .attr('x', margin.left + (innerWidth - logoSize) / 2)
    .attr('y', margin.top + (innerHeight - logoSize) / 2)
    .attr('opacity', 0.1);

  insertWatermarkRect(svg, innerWidth, innerHeight, margin, patternId);
}

/** Create a diagonal repeating "UNOFFICIAL" watermark pattern. */
export function createUnofficialWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
  chartId: string,
): void {
  const patternId = `unofficial-pattern-${chartId}`;
  // Brick pattern: two rows per tile, second row shifted by half-width.
  const patternWidth = 200;
  const rowHeight = 100;
  const patternHeight = rowHeight * 2;
  const pattern = defs
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', patternWidth)
    .attr('height', patternHeight)
    .attr('patternTransform', 'rotate(-45)');

  const addLabel = (x: number, y: number) => {
    pattern
      .append('text')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#dc2626')
      .attr('font-size', '24px')
      .attr('font-weight', 'bold')
      .attr('opacity', 0.15)
      .text('UNOFFICIAL');
  };

  // Row 1: centered.
  addLabel(patternWidth / 2, rowHeight / 2);
  // Row 2: staggered by half-width — drawn at both seams so the brick wraps
  // across adjacent tiles into a single label centered on each seam.
  addLabel(0, rowHeight + rowHeight / 2);
  addLabel(patternWidth, rowHeight + rowHeight / 2);

  insertWatermarkRect(svg, innerWidth, innerHeight, margin, patternId);
}
