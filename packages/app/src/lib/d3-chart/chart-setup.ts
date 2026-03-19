import * as d3 from 'd3';

import type { ChartLayout, ChartSetupConfig } from './types';
import { createLogoWatermark, createUnofficialWatermark } from './watermark';

/**
 * Creates or updates the structural SVG skeleton for a chart.
 * Idempotent: first call creates elements, subsequent calls update
 * dimensions/theme without destroying data layers in zoomGroup.
 */
export function setupChartStructure(
  svgElement: SVGSVGElement,
  config: ChartSetupConfig,
): ChartLayout {
  const {
    containerWidth,
    containerHeight,
    margin,
    watermark,
    clipContent = true,
    hideAxes = false,
  } = config;
  const width = containerWidth - margin.left - margin.right;
  const height = containerHeight - margin.top - margin.bottom;

  const svg = d3.select(svgElement);
  svg.attr('width', containerWidth).attr('height', containerHeight);

  // Detect existing structure
  const existingG = svg.select<SVGGElement>('.chart-root');
  const isNew = existingG.empty();

  if (isNew) {
    // ── First render: create full skeleton ──
    svg.selectAll('*').remove();

    const defs = svg.append('defs');

    // Watermark
    if (watermark === 'logo') {
      createLogoWatermark(svg, defs, containerWidth, containerHeight, width, height, margin);
    } else if (watermark === 'unofficial') {
      createUnofficialWatermark(svg, defs, containerWidth, containerHeight);
    }

    const g = svg
      .append('g')
      .attr('class', 'chart-root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid group (rendered behind data)
    const gridGroup = g.append('g').attr('class', 'grid');
    if (!hideAxes) {
      gridGroup
        .append('line')
        .attr('class', 'border-right')
        .attr('x1', width)
        .attr('x2', width)
        .attr('y1', 0)
        .attr('y2', height);
      gridGroup
        .append('line')
        .attr('class', 'border-top')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', 0)
        .attr('y2', 0);
    }

    const xAxisGroup = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`);
    const yAxisGroup = g.append('g').attr('class', 'y-axis');

    let zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    if (clipContent) {
      defs
        .append('clipPath')
        .attr('id', `clip-${config.chartId}`)
        .append('rect')
        .attr('width', width)
        .attr('height', height);

      zoomGroup = g
        .append('g')
        .attr('class', 'zoom-group')
        .attr('clip-path', `url(#clip-${config.chartId})`);
    } else {
      zoomGroup = g.append('g').attr('class', 'zoom-group');
    }

    if (config.yLabel) {
      svg
        .append('text')
        .attr('class', 'y-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + height / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .text(config.yLabel);
    }

    if (config.xLabel) {
      svg
        .append('text')
        .attr('class', 'x-axis-label')
        .attr('x', margin.left + width / 2)
        .attr('y', containerHeight - 10)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .text(config.xLabel);
    }

    return { svg, g, zoomGroup, xAxisGroup, yAxisGroup, gridGroup, defs, width, height, margin };
  }

  // ── Subsequent renders: update existing structure ──
  const g = existingG;
  g.attr('transform', `translate(${margin.left},${margin.top})`);

  const defs = svg.select<SVGDefsElement>('defs');

  // Update grid border positions
  const gridGroup = g.select<SVGGElement>('.grid');
  if (!config.hideAxes) {
    gridGroup.select('.border-right').attr('x1', width).attr('x2', width).attr('y2', height);
    gridGroup.select('.border-top').attr('x2', width);
  }

  // Update axis group positions
  const xAxisGroup = g.select<SVGGElement>('.x-axis').attr('transform', `translate(0,${height})`);
  const yAxisGroup = g.select<SVGGElement>('.y-axis');

  // Update clip rect
  if (clipContent) {
    defs.select(`#clip-${config.chartId} rect`).attr('width', width).attr('height', height);
  }

  const zoomGroup = g.select<SVGGElement>('.zoom-group');

  // Update watermark — detect type change and recreate if needed
  const hasLogo = !defs.select('#logo-pattern').empty();
  const hasUnofficial = !defs.select('#unofficial-pattern').empty();
  const needsSwitch =
    (watermark === 'unofficial' && !hasUnofficial) ||
    (watermark === 'logo' && !hasLogo) ||
    (watermark === 'none' && (hasLogo || hasUnofficial));

  if (needsSwitch) {
    svg.select('.watermark-rect').remove();
    defs.select('#logo-pattern').remove();
    defs.select('#unofficial-pattern').remove();
    if (watermark === 'logo') {
      createLogoWatermark(svg, defs, containerWidth, containerHeight, width, height, margin);
    } else if (watermark === 'unofficial') {
      createUnofficialWatermark(svg, defs, containerWidth, containerHeight);
    }
  } else {
    svg.select('.watermark-rect').attr('width', containerWidth).attr('height', containerHeight);
    if (watermark === 'logo') {
      const logoSize = Math.min(width, height) * 0.6;
      const pattern = defs.select('#logo-pattern');
      if (!pattern.empty()) {
        pattern.attr('width', containerWidth).attr('height', containerHeight);
        pattern
          .select('image')
          .attr('width', logoSize)
          .attr('height', logoSize)
          .attr('x', margin.left + (width - logoSize) / 2)
          .attr('y', margin.top + (height - logoSize) / 2);
      }
    }
  }

  // Update Y-axis label position
  const yLabel = svg.select('.y-axis-label');
  if (!yLabel.empty()) {
    yLabel.attr('x', -(margin.top + height / 2)).text(config.yLabel ?? '');
  }

  // Update X-axis label position
  const xLabelEl = svg.select('.x-axis-label');
  if (!xLabelEl.empty()) {
    xLabelEl
      .attr('x', margin.left + width / 2)
      .attr('y', containerHeight - 10)
      .text(config.xLabel ?? '');
  }

  return { svg, g, zoomGroup, xAxisGroup, yAxisGroup, gridGroup, defs, width, height, margin };
}
