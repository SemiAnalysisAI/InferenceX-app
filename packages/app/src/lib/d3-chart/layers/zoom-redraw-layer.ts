import type * as d3 from 'd3';

import type { CustomLayerConfig } from '../D3Chart/types';
import type { ContinuousScale } from '../types';

/** Draws into the zoom group from the plot's continuous scales and size. */
export type ZoomRedraw = (
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: ContinuousScale,
  yScale: ContinuousScale,
  width: number,
  height: number,
) => void;

/**
 * A custom layer that one draw function paints on render, from the scales as last rendered
 * so a zoomed chart keeps its zoom, and again on every zoom frame from the zoomed scales.
 */
export function zoomRedrawLayer(key: string, draw: ZoomRedraw): CustomLayerConfig {
  return {
    type: 'custom',
    key,
    render: (zoomGroup, ctx) =>
      draw(
        zoomGroup,
        (ctx.renderedXScale ?? ctx.xScale) as ContinuousScale,
        (ctx.renderedYScale ?? ctx.yScale) as ContinuousScale,
        ctx.width,
        ctx.height,
      ),
    onZoom: (zoomGroup, ctx) =>
      draw(
        zoomGroup,
        ctx.newXScale as ContinuousScale,
        ctx.newYScale as ContinuousScale,
        ctx.width,
        ctx.height,
      ),
  };
}
