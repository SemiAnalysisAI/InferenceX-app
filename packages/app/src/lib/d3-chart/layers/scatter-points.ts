import * as d3 from 'd3';

import {
  HIT_AREA_RADIUS,
  type ShapeKey,
  type ShapeSelection,
  getShapeConfig,
  getShapeKeyForPrecision,
  applyNormalState,
} from '@/lib/chart-rendering';

import type { ContinuousScale } from '../types';
import { CHART_TYPE, px } from '../typography';

export interface ScatterPointConfig<T> {
  getColor: (d: T) => string;
  getOpacity?: (d: T) => number;
  getPointerEvents?: (d: T) => string;
  hideLabels?: boolean;
  getLabelText?: (d: T) => string;
  foreground?: string;
  dataAttrs?: Record<string, (d: T) => string>;
  /**
   * Selected precisions, in selection order. Controls shape assignment:
   * first precision → circle, second → square, third → triangle, fourth → diamond.
   * Defaults to `[d.precision]` per-point (all points render as circles).
   */
  selectedPrecisions?: readonly string[];
  /**
   * Per-point shape resolver. Takes precedence over `selectedPrecisions`.
   * Use when the shape mapping must stay current between layer-config
   * recreations (e.g. read through a ref so a precision toggle doesn't have
   * to rebuild the whole chart).
   */
  getShapeKey?: (d: T) => ShapeKey;
}

const resolveShapeKey = (precision: string, selectedPrecisions?: readonly string[]): ShapeKey =>
  selectedPrecisions && selectedPrecisions.length > 0
    ? getShapeKeyForPrecision(precision, selectedPrecisions)
    : 'circle';

/**
 * Ensure a dot-group's `.visible-shape` matches the target shape and fill.
 * Swaps the SVG element (remove/append) when its tag needs to change, and
 * stamps the shape key on the element so other code (e.g. useStickyTooltip's
 * reset path) can restore normal-state attrs without knowing precisions.
 *
 * Shared by the full layer render and by ScatterGraph's lightweight toggle
 * decoration pass, so both produce identical DOM.
 */
export function syncPointShape(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  shapeKey: ShapeKey,
  fill: string,
): void {
  const targetType = getShapeConfig(shapeKey).type;
  const existing = g.select<SVGElement>('.visible-shape').node();
  const currentType = existing?.tagName.toLowerCase();
  let shape: ShapeSelection;
  if (!existing || currentType !== targetType) {
    g.select('.visible-shape').remove();
    shape = g
      .append(targetType)
      .attr('class', 'visible-shape')
      .attr('data-shape-key', shapeKey)
      .attr('fill', fill)
      .attr('stroke', 'none')
      .attr('cursor', 'pointer') as ShapeSelection;
  } else {
    shape = g.select<SVGCircleElement | SVGRectElement | SVGPathElement>('.visible-shape');
    shape.attr('fill', fill).attr('data-shape-key', shapeKey);
  }
  applyNormalState(shape, shapeKey);
}

/**
 * Render scatter points into a zoom group: group → hit area → shape → optional label.
 * Uses D3 enter/update/exit so existing DOM nodes are reused on data changes.
 * Returns the merged enter+update selection for attaching event handlers.
 */
export function renderScatterPoints<T extends { precision: string; x: number; y: number }>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: T[],
  xScale: ContinuousScale,
  yScale: ContinuousScale,
  config: ScatterPointConfig<T>,
  keyFn?: (d: T) => string,
): d3.Selection<SVGGElement, T, SVGGElement, unknown> {
  const selection = zoomGroup.selectAll<SVGGElement, T>('.dot-group').data(data, keyFn);
  const positionFn = (d: T) => `translate(${xScale(d.x)},${yScale(d.y)})`;

  // Enter: create new point groups with children
  const entered = selection.enter().append('g').attr('class', 'dot-group');

  // Hit area (enter only)
  entered
    .append('circle')
    .attr('r', HIT_AREA_RADIUS)
    .attr('fill', 'transparent')
    .attr('cursor', 'pointer');

  // Visible shape is created (or swapped, if selectedPrecisions changed) in the
  // merged update pass below.

  // Exit: remove stale points
  selection.exit().remove();

  // Merge enter + update
  const points = entered.merge(selection);

  // Position all elements at current scale
  points.attr('transform', positionFn);

  if (config.getOpacity) {
    points.style('opacity', config.getOpacity);
  }
  if (config.getPointerEvents) {
    points.style('pointer-events', config.getPointerEvents);
  }
  if (config.dataAttrs) {
    for (const [attr, fn] of Object.entries(config.dataAttrs)) {
      points.attr(`data-${attr}`, fn);
    }
  }

  // Update shape type (if the shape mapping changed) + colors on all points.
  points.each(function (d) {
    const g = d3.select(this);
    const shapeKey = config.getShapeKey
      ? config.getShapeKey(d)
      : resolveShapeKey(d.precision, config.selectedPrecisions);
    syncPointShape(g, shapeKey, config.getColor(d));
  });

  // Labels stay joined across display toggles. The display phase changes only
  // visibility, while data and metric phases may update their text.
  if (config.getLabelText && config.foreground) {
    const labelGetter = config.getLabelText;
    points.each(function (d) {
      const lines = labelGetter(d).split('\n');
      const text = d3
        .select(this)
        .selectAll<SVGTextElement, boolean>('.point-label')
        .data([true])
        .join('text')
        .attr('class', 'point-label')
        .attr('text-anchor', 'middle')
        .attr('fill', config.foreground!)
        .attr('font-size', px(CHART_TYPE.dataLabel))
        .attr('font-weight', '700')
        .attr('pointer-events', 'none');
      const firstDy = -(0.8 + (lines.length - 1) * 1.1);
      text
        .selectAll<SVGTSpanElement, string>('tspan')
        .data(lines)
        .join('tspan')
        .attr('x', 0)
        .attr('dy', (_l, i) => (i === 0 ? `${firstDy}em` : '1.1em'))
        .text((l) => l);
    });
    points
      .selectAll('.point-label')
      .style('display', config.hideLabels ? 'none' : '')
      .style('opacity', config.hideLabels ? 0 : 1);
  } else {
    points.selectAll('.point-label').remove();
  }

  return points;
}

/**
 * Restyle existing scatter marks without rejoining data or rewriting positions.
 * Used by the display phase for palette, visibility, and label toggles.
 */
export function updateScatterPointsForDisplay<
  T extends { precision: string; x: number; y: number },
>(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  config: ScatterPointConfig<T>,
): void {
  const points = zoomGroup.selectAll<SVGGElement, T>('.dot-group');
  points.each(function (d) {
    const point = d3.select(this);
    if (config.getOpacity) point.style('opacity', config.getOpacity(d));
    if (config.getPointerEvents) point.style('pointer-events', config.getPointerEvents(d));
    const shapeKey = config.getShapeKey
      ? config.getShapeKey(d)
      : resolveShapeKey(d.precision, config.selectedPrecisions);
    syncPointShape(
      point as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
      shapeKey,
      config.getColor(d),
    );
  });
  points
    .selectAll('.point-label')
    .attr('fill', config.foreground ?? null)
    .style('display', config.hideLabels ? 'none' : '')
    .style('opacity', config.hideLabels ? 0 : 1);
}

export interface TooltipContainerGeometry {
  bounds: DOMRect;
  width: number;
  height: number;
}

interface TooltipGeometry {
  width: number;
  height: number;
  sizeStyle: string;
  className: string | null;
}

let containerGeometryCache = new WeakMap<HTMLElement, TooltipContainerGeometry>();
let tooltipGeometryCache = new WeakMap<HTMLDivElement, TooltipGeometry>();
let geometryResetPending = false;

function scheduleGeometryReset(): void {
  if (geometryResetPending) return;
  geometryResetPending = true;
  const reset = () => {
    containerGeometryCache = new WeakMap();
    tooltipGeometryCache = new WeakMap();
    geometryResetPending = false;
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reset);
  else setTimeout(reset, 0);
}

/**
 * Invalidate dimensions after synchronously replacing tooltip content.
 * Style/class changes are detected from their non-layout attributes; callers
 * use this helper when content and positioning happen in one event.
 */
export function invalidateTooltipGeometry(tooltip: HTMLDivElement | null): void {
  if (tooltip) tooltipGeometryCache.delete(tooltip);
}

function tooltipSizeStyleSignature(tooltip: HTMLDivElement): string {
  const { style } = tooltip;
  return [
    style.width,
    style.height,
    style.minWidth,
    style.minHeight,
    style.maxWidth,
    style.maxHeight,
    style.padding,
    style.borderWidth,
    style.boxSizing,
    style.font,
    style.fontSize,
    style.fontWeight,
    style.lineHeight,
    style.letterSpacing,
    style.whiteSpace,
  ].join('|');
}

function getTooltipGeometry(tooltip: HTMLDivElement): TooltipGeometry {
  const sizeStyle = tooltipSizeStyleSignature(tooltip);
  const className = tooltip.getAttribute('class');
  const cached = tooltipGeometryCache.get(tooltip);
  if (cached && cached.sizeStyle === sizeStyle && cached.className === className) return cached;
  const bounds = tooltip.getBoundingClientRect();
  const geometry = {
    width: bounds.width || tooltip.offsetWidth,
    height: bounds.height || tooltip.offsetHeight,
    sizeStyle,
    className,
  };
  tooltipGeometryCache.set(tooltip, geometry);
  scheduleGeometryReset();
  return geometry;
}

/**
 * Return container geometry shared by every tooltip position calculation in
 * the current animation frame. Pointer events can fire more often than paint;
 * coalescing these layout reads avoids measuring the same chart repeatedly.
 */
export function getTooltipContainerGeometry(container: HTMLElement): TooltipContainerGeometry {
  const cached = containerGeometryCache.get(container);
  if (cached) return cached;

  const geometry = {
    bounds: container.getBoundingClientRect(),
    width: container.clientWidth,
    height: container.clientHeight,
  };
  containerGeometryCache.set(container, geometry);
  scheduleGeometryReset();
  return geometry;
}

/**
 * Compute tooltip left/top **in viewport coordinates** so the tooltip can be
 * rendered via portal with `position: fixed`. Callers still pass cursor coords
 * relative to `container` (matching `d3.pointer(event, container)`).
 *
 * Why viewport coords: the chart cards use `backdrop-filter`, which creates
 * a stacking context. A tooltip painted inside the upper card's stacking
 * context cannot rise above the lower card's stacking context regardless of
 * its z-index. Portalling to document.body + `position: fixed` sidesteps the
 * whole problem; we just need the coordinates in viewport space.
 *
 * Strategy: pick preferred side (right/below cursor), flip if it overflows the
 * container, then clamp the final fixed coordinates to the viewport. The
 * viewport clamp matters when a chart continues below the fold: container-
 * local coordinates can otherwise place a pinned tooltip's actions offscreen.
 */
export function computeTooltipPosition(
  mx: number,
  my: number,
  tooltip:
    | d3.Selection<HTMLDivElement | null, unknown, null, undefined>
    | d3.Selection<HTMLDivElement, unknown, null, undefined>,
  container: HTMLElement,
  offset = 10,
  containerGeometry?: TooltipContainerGeometry,
): { left: number; top: number } {
  const node = tooltip.node();
  if (!node) return { left: mx + offset, top: my + offset };

  // Ensure the tooltip is measurable. Moving from hidden to shown changes its
  // size lifecycle, so discard any dimensions measured before that style write.
  if (node.style.display !== 'block') {
    node.style.display = 'block';
    invalidateTooltipGeometry(node);
  }

  const tooltipGeometry = getTooltipGeometry(node);
  const tw = tooltipGeometry.width;
  const th = tooltipGeometry.height;
  const geometry = containerGeometry ?? getTooltipContainerGeometry(container);
  const rect = geometry.bounds;
  const cw = geometry.width;
  const ch = geometry.height;
  const EDGE_PAD = 4;

  // Prefer right of cursor; flip to left if no room.
  let left = mx + offset + tw <= cw ? mx + offset : mx - offset - tw;
  left = Math.max(EDGE_PAD, Math.min(cw - tw - EDGE_PAD, left));

  // Prefer below cursor; flip above if no room.
  let top = my + offset + th <= ch ? my + offset : my - offset - th;
  top = Math.max(EDGE_PAD, Math.min(ch - th - EDGE_PAD, top));

  // Convert container-local coords → viewport coords for `position: fixed`,
  // then keep the complete tooltip visible when its dimensions permit it.
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  left += rect.left;
  top += rect.top;
  left = Math.max(EDGE_PAD, Math.min(viewportWidth - tw - EDGE_PAD, left));
  top = Math.max(EDGE_PAD, Math.min(viewportHeight - th - EDGE_PAD, top));

  return { left, top };
}

/** Update scatter point positions on zoom. */
export function updateScatterPointsOnZoom(
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  newXScale: ContinuousScale,
  newYScale: ContinuousScale,
  className = '.dot-group',
): void {
  zoomGroup
    .selectAll<SVGGElement, { x: number; y: number }>(className)
    .attr('transform', (d) => `translate(${newXScale(d.x)},${newYScale(d.y)})`);
}
