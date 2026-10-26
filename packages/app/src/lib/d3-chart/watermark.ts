import type * as d3 from 'd3';

import type { ChartMargin } from './types';
import { CHART_TYPE, px } from './typography';

const UNOFFICIAL_WATERMARK_IMAGE_PATH = '/decorative/kanye-west.png';

export function updateBackgroundWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  label: string | undefined,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
): void {
  svg.selectAll('.deprecated-watermark').remove();
  if (!label) return;

  // Main's centered logo occupies at most the middle 60% of the plot height.
  // Reserve separate bands above and below it without moving or resizing it.
  for (const [position, offset] of [
    ['above', 0.02],
    ['below', 0.82],
  ] as const) {
    const mark = svg
      .insert('svg', '.chart-root')
      .attr('class', 'deprecated-watermark')
      .attr('data-testid', 'deprecated-watermark')
      .attr('data-position', position)
      .attr('x', margin.left + innerWidth * 0.1)
      .attr('y', margin.top + innerHeight * offset)
      .attr('width', innerWidth * 0.8)
      .attr('height', innerHeight * 0.16)
      .attr('viewBox', '0 0 1000 200')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('fill', 'currentColor')
      .attr('opacity', 0.3)
      .attr('pointer-events', 'none')
      .attr('role', 'img')
      .attr('aria-label', label)
      .attr('aria-hidden', position === 'below' ? 'true' : null);

    mark
      .append('text')
      .attr('x', 500)
      .attr('y', 100)
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .attr('font-size', px(CHART_TYPE.backgroundWatermark))
      .attr('font-weight', 800)
      .text(label);
  }
}

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

export function positionUnofficialWatermarkImage(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
): void {
  svg
    .select<SVGImageElement>('.unofficial-watermark-image')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', innerWidth)
    .attr('height', innerHeight);
}

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

export function createUnofficialWatermark(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  innerWidth: number,
  innerHeight: number,
  margin: ChartMargin,
  chartId: string,
): void {
  const patternId = `unofficial-pattern-${chartId}`;
  const patternWidth = 460;
  const rowHeight = 130;
  const patternHeight = rowHeight * 2;
  const pattern = defs
    .append('pattern')
    .attr('id', patternId)
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', patternWidth)
    .attr('height', patternHeight)
    .attr('patternTransform', 'rotate(-45)');

  const addLabel = (x: number, y: number) => {
    const label = pattern
      .append('text')
      .attr('x', x)
      .attr('y', y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', '#dc2626')
      .attr('font-size', px(CHART_TYPE.watermark))
      .attr('font-weight', 'bold')
      .attr('opacity', 0.25);

    label
      .append('tspan')
      .attr('x', x)
      .attr('dy', '-0.6em')
      .text('UNOFFICIAL RESULTS, DO NOT TRUST');
    label
      .append('tspan')
      .attr('x', x)
      .attr('dy', '1.2em')
      .text('May contain hacks, or not fully passing evals');
  };

  addLabel(patternWidth / 2, rowHeight / 2);
  addLabel(0, rowHeight + rowHeight / 2);
  addLabel(patternWidth, rowHeight + rowHeight / 2);

  insertWatermarkRect(svg, innerWidth, innerHeight, margin, patternId);

  svg
    .insert('image', ':first-child')
    .attr('class', 'unofficial-watermark-image')
    .attr('href', UNOFFICIAL_WATERMARK_IMAGE_PATH)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('opacity', 0.22)
    .attr('pointer-events', 'none')
    .attr('aria-hidden', 'true');
  positionUnofficialWatermarkImage(svg, innerWidth, innerHeight, margin);
}
