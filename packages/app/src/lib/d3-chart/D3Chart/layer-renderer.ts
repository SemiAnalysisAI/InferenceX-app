import * as d3 from 'd3';

import type { ChartLayout, ContinuousScale } from '../types';
import { CHART_TYPE, px } from '../typography';
import { renderBars, updateBarsOnZoom } from '../layers/bars';
import {
  renderHorizontalBars,
  updateHorizontalBarsForDisplay,
  updateHorizontalBarsOnZoom,
} from '../layers/horizontal-bars';
import { renderPoints, updatePointsOnZoom } from '../layers/points';
import { renderErrorBars, updateErrorBarsOnZoom } from '../layers/error-bars';
import { renderLines, updateLinesOnZoom } from '../layers/lines';
import {
  renderRooflines,
  updateRooflinesForDisplay,
  updateRooflinesOnZoom,
} from '../layers/rooflines';
import { renderBarLabels, updateBarLabelsOnZoom } from '../layers/bar-labels';
import {
  renderScatterPoints,
  updateScatterPointsForDisplay,
  updateScatterPointsOnZoom,
} from '../layers/scatter-points';
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
    case 'bar': {
      return renderBars(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        yScale as ContinuousScale,
        height,
        layer.config,
      );
    }

    case 'horizontalBar': {
      return renderHorizontalBars(
        group,
        layer.data,
        yScale as d3.ScaleBand<string>,
        xScale as ContinuousScale,
        layer.config,
      );
    }

    case 'point': {
      return renderPoints(
        group,
        layer.data,
        layer.config,
        layer.config.getX ? (xScale as ContinuousScale) : undefined,
        layer.config.getY ? (yScale as ContinuousScale) : undefined,
      );
    }

    case 'errorBar': {
      return renderErrorBars(group, layer.data, layer.config);
    }

    case 'line': {
      renderLines(
        group,
        layer.lines,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
      );
      return null;
    }

    case 'roofline': {
      renderRooflines(
        group,
        layer.rooflines,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
      );
      return null;
    }

    case 'barLabel': {
      renderBarLabels(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        yScale as ContinuousScale,
        height,
        layer.config,
      );
      return null;
    }

    case 'scatter': {
      return renderScatterPoints(
        group,
        layer.data,
        xScale as ContinuousScale,
        yScale as ContinuousScale,
        layer.config,
        layer.keyFn,
      );
    }

    case 'radar': {
      return renderRadar(group, layer.data, width, height, layer.config);
    }

    case 'custom': {
      if (layer.render) {
        const result = layer.render(group, ctx);
        return result ?? null;
      }
      return null;
    }
  }
}

/**
 * Cheap geometry updates that should follow every zoom event.
 */
export function updateLayerPositionOnZoom<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: BuiltScale,
  newXScale: BuiltScale,
  newYScale: BuiltScale,
  layout: ChartLayout,
): void {
  const { height } = layout;
  switch (layer.type) {
    case 'bar': {
      updateBarsOnZoom(group, newYScale as ContinuousScale, height, layer.config.getY);
      break;
    }
    case 'horizontalBar': {
      updateHorizontalBarsOnZoom(group, newXScale as ContinuousScale, layer.config.getX);
      break;
    }
    case 'point': {
      const { getX, getY, getCx, getCy } = layer.config;
      updatePointsOnZoom(
        group,
        getX ? (d: T) => (newXScale as ContinuousScale)(getX(d)) : getCx,
        getY ? (d: T) => (newYScale as ContinuousScale)(getY(d)) : getCy,
      );
      break;
    }
    case 'errorBar': {
      updateErrorBarsOnZoom(group, layer.config);
      break;
    }
    case 'scatter': {
      updateScatterPointsOnZoom(group, newXScale as ContinuousScale, newYScale as ContinuousScale);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Expensive path, label, and annotation work. The renderer coalesces this
 * phase through one animation frame.
 */
export function updateLayerDecorationOnZoom<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: BuiltScale,
  newXScale: BuiltScale,
  newYScale: BuiltScale,
  layout: ChartLayout,
  ctx: ZoomContext,
): void {
  const { height } = layout;
  switch (layer.type) {
    case 'line': {
      updateLinesOnZoom(
        group,
        layer.lines,
        newXScale as ContinuousScale,
        newYScale as ContinuousScale,
        layer.config,
      );
      break;
    }
    case 'roofline': {
      updateRooflinesOnZoom(
        group,
        layer.rooflines,
        newXScale as ContinuousScale,
        newYScale as ContinuousScale,
      );
      break;
    }
    case 'barLabel': {
      updateBarLabelsOnZoom(
        group,
        layer.data,
        xScale as d3.ScaleBand<string>,
        newYScale as ContinuousScale,
        height,
        layer.config,
      );
      break;
    }
    case 'custom': {
      layer.onZoom?.(group, ctx);
      break;
    }
    default: {
      break;
    }
  }
}

/**
 * Update metric coordinates without re-running the scatter data join.
 */
export function updateLayerForMetric<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: BuiltScale,
  yScale: BuiltScale,
  layout: ChartLayout,
  ctx: RenderContext,
): d3.Selection<any, any, any, any> | null {
  if (layer.type !== 'scatter') {
    return renderLayer(layer, group, xScale, yScale, layout, ctx);
  }

  const keyFor = (datum: (typeof layer.data)[number], index: number): string =>
    layer.keyFn ? layer.keyFn(datum) : String(index);
  const nextByKey = new Map<string, (typeof layer.data)[number]>();
  layer.data.forEach((datum, index) => nextByKey.set(keyFor(datum, index), datum));
  const selection = group
    .selectAll<SVGGElement, (typeof layer.data)[number]>('.dot-group')
    .each((bound, index) => {
      const next = nextByKey.get(keyFor(bound, index));
      if (next) Object.assign(bound, next);
    });
  const getLabelText = layer.config.getLabelText;
  const foreground = layer.config.foreground;
  if (getLabelText && foreground) {
    selection.each(function (datum) {
      const lines = getLabelText(datum).split('\n');
      const firstDy = -(0.8 + (lines.length - 1) * 1.1);
      d3.select(this)
        .selectAll<SVGTextElement, boolean>('.point-label')
        .data([true])
        .join('text')
        .attr('class', 'point-label')
        .attr('text-anchor', 'middle')
        .attr('fill', foreground)
        .attr('font-size', px(CHART_TYPE.dataLabel))
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .style('display', layer.config.hideLabels ? 'none' : '')
        .style('opacity', layer.config.hideLabels ? 0 : 1)
        .selectAll<SVGTSpanElement, string>('tspan')
        .data(lines)
        .join('tspan')
        .attr('x', 0)
        .attr('dy', (_line, index) => (index === 0 ? `${firstDy}em` : '1.1em'))
        .text((line) => line);
    });
  } else {
    selection.selectAll('.point-label').remove();
  }
  updateScatterPointsOnZoom(group, xScale as ContinuousScale, yScale as ContinuousScale);
  return selection;
}

/** Update scale-neutral decoration without rebuilding joins, scales, or paths. */
export function updateLayerForDisplay<T>(
  layer: LayerConfig<T>,
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  ctx: RenderContext,
): void {
  if (layer.type === 'scatter') {
    updateScatterPointsForDisplay(group, layer.config);
    return;
  }
  if (layer.type === 'horizontalBar') {
    updateHorizontalBarsForDisplay(group, layer.config);
    return;
  }
  if (layer.type === 'roofline') {
    updateRooflinesForDisplay(group, layer.config);
    return;
  }
  if (layer.type === 'custom') layer.onDisplayUpdate?.(group, ctx);
}
