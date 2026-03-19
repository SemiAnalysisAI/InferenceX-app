import * as d3 from 'd3';

import type { ChartLayout, ContinuousScale } from '../types';
import { renderBars, updateBarsOnZoom } from '../layers/bars';
import { renderHorizontalBars, updateHorizontalBarsOnZoom } from '../layers/horizontal-bars';
import { renderPoints, updatePointsOnZoom } from '../layers/points';
import { renderErrorBars, updateErrorBarsOnZoom } from '../layers/error-bars';
import { renderLines, updateLinesOnZoom } from '../layers/lines';
import { renderRooflines, updateRooflinesOnZoom } from '../layers/rooflines';
import { renderBarLabels, updateBarLabelsOnZoom } from '../layers/bar-labels';
import { renderScatterPoints, updateScatterPointsOnZoom } from '../layers/scatter-points';
import { renderRadar } from '../layers/radar';

import type { BuiltScale } from './scale-builders';
import type { LayerConfig, RenderContext, ZoomContext } from './types';

/**
 * Render a single layer into the chart's zoomGroup (or g for non-clipped charts).
 * Returns the D3 selection if the layer produces one (for tooltip attachment).
 */
export function renderLayer<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: BuiltScale,
  yScale: BuiltScale,
  layout: ChartLayout,
  ctx: RenderContext,
): d3.Selection<any, any, any, any> | null {
  const { width, height } = layout;

  switch (layer.type) {
    case 'bar':
      return renderBars(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        yScale as ContinuousScale,
        height,
        layer.config,
      );

    case 'horizontalBar':
      return renderHorizontalBars(
        group,
        layer.data,
        yScale as d3.ScaleBand<string>,
        xScale as ContinuousScale,
        layer.config,
      );

    case 'point':
      return renderPoints(
        group,
        layer.data,
        layer.config,
        layer.config.getX ? (xScale as ContinuousScale) : undefined,
        layer.config.getY ? (yScale as ContinuousScale) : undefined,
      );

    case 'errorBar':
      return renderErrorBars(group, layer.data, layer.config);

    case 'line':
      renderLines(
        group,
        layer.lines,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
      );
      return null;

    case 'roofline':
      renderRooflines(
        group,
        layer.rooflines,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
      );
      return null;

    case 'barLabel':
      renderBarLabels(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        yScale as ContinuousScale,
        height,
        layer.config,
      );
      return null;

    case 'scatter':
      return renderScatterPoints(
        group,
        layer.data,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
        layer.keyFn,
      );

    case 'radar':
      return renderRadar(group, layer.data, width, height, layer.config);

    case 'custom':
      if (layer.render) {
        const result = layer.render(group, ctx);
        return result ?? null;
      }
      return null;
  }
}

/**
 * Update a single layer on zoom with new scales.
 */
export function updateLayerOnZoom<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: BuiltScale,
  _yScale: BuiltScale,
  newXScale: BuiltScale,
  newYScale: BuiltScale,
  layout: ChartLayout,
  ctx: ZoomContext,
): void {
  const { height } = layout;

  switch (layer.type) {
    case 'bar':
      updateBarsOnZoom(group, newYScale as ContinuousScale, height, layer.config.getY);
      break;

    case 'horizontalBar':
      updateHorizontalBarsOnZoom(group, newXScale as ContinuousScale, layer.config.getX);
      break;

    case 'point': {
      const { getX, getY, getCx, getCy } = layer.config;
      updatePointsOnZoom(
        group,
        getX ? (d: any) => (newXScale as ContinuousScale)(getX(d)) : getCx,
        getY ? (d: any) => (newYScale as ContinuousScale)(getY(d)) : getCy,
      );
      break;
    }

    case 'errorBar':
      updateErrorBarsOnZoom(group, layer.config);
      break;

    case 'line':
      updateLinesOnZoom(
        group,
        layer.lines,
        newXScale as ContinuousScale,
        newYScale as ContinuousScale,
        layer.config,
      );
      break;

    case 'roofline':
      updateRooflinesOnZoom(
        group,
        layer.rooflines,
        newXScale as ContinuousScale,
        newYScale as ContinuousScale,
      );
      break;

    case 'barLabel':
      updateBarLabelsOnZoom(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        newYScale as ContinuousScale,
        height,
        layer.config,
      );
      break;

    case 'scatter':
      updateScatterPointsOnZoom(group, newXScale as ContinuousScale, newYScale as ContinuousScale);
      break;

    case 'radar':
      // Radar charts don't support zoom
      break;

    case 'custom':
      if (layer.onZoom) {
        layer.onZoom(group, ctx);
      }
      break;
  }
}
