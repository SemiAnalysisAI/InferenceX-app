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
  svg.select('.historical-watermark').remove();
  if (!label) return;

  const mark = svg
    .insert('svg', '.chart-root')
    .attr('class', 'historical-watermark')
    .attr('data-testid', 'historical-watermark')
    .attr('x', margin.left)
    .attr('y', margin.top)
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('viewBox', '0 0 1000 500')
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('fill', 'currentColor')
    .attr('opacity', 0.16)
    .attr('pointer-events', 'none')
    .attr('role', 'img')
    .attr('aria-label', label.replaceAll('\n', ' — '));

  mark
    .selectAll('text')
    .data(label.split('\n'))
    .join('text')
    .attr('x', 500)
    .attr('y', (_, index) => 230 + index * 80)
    .attr('text-anchor', 'middle')
    .attr('font-size', (_, index) =>
      px(
        index === 0 ? CHART_TYPE.backgroundWatermarkTitle : CHART_TYPE.backgroundWatermarkSubtitle,
      ),
    )
    .attr('font-weight', 800)
    .text((line) => line);
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
