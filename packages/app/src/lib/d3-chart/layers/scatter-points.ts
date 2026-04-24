import * as d3 from 'd3';

import {
  HIT_AREA_RADIUS,
  type ShapeKey,
  getShapeConfig,
  getShapeKeyForPrecision,
  applyNormalState,
  applyHoverState,
} from '@/lib/chart-rendering';

import type { ContinuousScale } from '../types';

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
}

const resolveShapeKey = (precision: string, selectedPrecisions?: readonly string[]): ShapeKey =>
  selectedPrecisions && selectedPrecisions.length > 0
    ? getShapeKeyForPrecision(precision, selectedPrecisions)
    : 'circle';

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

  // Label (enter only)
  if (!config.hideLabels && config.getLabelText && config.foreground) {
    entered
      .append('text')
      .attr('class', 'point-label')
      .attr('dy', -8)
      .attr('text-anchor', 'middle')
      .attr('fill', config.foreground)
      .attr('font-size', '10px')
      .attr('pointer-events', 'none')
      .text(config.getLabelText);
  }

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

  // Update shape type (if selectedPrecisions changed) + colors on all points.
  // The shape element is swapped (remove/append) when its SVG tag needs to change.
  // The chosen shape key is stamped on the element so other code (e.g.
  // useStickyTooltip's reset path) can restore normal-state attrs without
  // knowing selectedPrecisions.
  points.each(function (d) {
    const g = d3.select(this);
    const shapeKey = resolveShapeKey(d.precision, config.selectedPrecisions);
    const targetType = getShapeConfig(shapeKey).type;
    const existing = g.select<SVGElement>('.visible-shape').node();
    const currentType = existing?.tagName.toLowerCase();
    if (!existing || currentType !== targetType) {
      g.select('.visible-shape').remove();
      const shape = g
        .append(targetType)
        .attr('class', 'visible-shape')
        .attr('data-shape-key', shapeKey)
        .attr('fill', config.getColor(d))
        .attr('stroke', 'none')
        .attr('cursor', 'pointer') as d3.Selection<
        SVGCircleElement | SVGRectElement | SVGPathElement,
        unknown,
        null,
        undefined
      >;
      applyNormalState(shape, shapeKey);
    } else {
      const shape = g.select<SVGElement>('.visible-shape');
      shape.attr('fill', config.getColor(d)).attr('data-shape-key', shapeKey);
      applyNormalState(shape as any, shapeKey);
    }
  });

  // Update labels: use data join so labels are created/removed properly on toggle
  if (!config.hideLabels && config.getLabelText && config.foreground) {
    points.each(function (d) {
      const g = d3.select(this);
      g.selectAll<SVGTextElement, boolean>('.point-label')
        .data([true])
        .join('text')
        .attr('class', 'point-label')
        .attr('dy', -8)
        .attr('text-anchor', 'middle')
        .attr('fill', config.foreground!)
        .attr('font-size', '10px')
        .attr('pointer-events', 'none')
        .text(config.getLabelText!(d));
    });
  } else {
    points.selectAll('.point-label').remove();
  }

  return points;
}

/**
 * Attach scatter point tooltip handlers (hover, click, pin).
 * Works for both ScatterGraph and GPUGraph.
 */
export function attachScatterTooltipHandlers<
  T extends { precision: string; x: number; y: number; hwKey?: string | number },
>(
  points: d3.Selection<SVGGElement, T, SVGGElement, unknown>,
  config: {
    xScale: ContinuousScale;
    yScale: ContinuousScale;
    svgRef: React.RefObject<SVGSVGElement | null> | React.RefObject<SVGSVGElement>;
    tooltip: d3.Selection<HTMLDivElement | null, unknown, null, undefined>;
    container: HTMLElement;
    rulerGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    verticalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
    horizontalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
    isPinned: () => boolean;
    pinTooltip: (point: T, isOverlay: boolean) => void;
    generateTooltipContent: (d: T, pinned: boolean) => string;
    trackEvent?: (hw: string, x: number, y: number) => void;
    /** Called after a point is clicked and tooltip is pinned. Use to attach handlers to tooltip buttons. */
    onPointClick?: (
      d: T,
      tooltip: d3.Selection<HTMLDivElement | null, unknown, null, undefined>,
    ) => void;
    /** Called on double-click of a point. */
    onPointDblClick?: (event: MouseEvent, d: T) => void;
    /** Ref to current scales — when provided, avoids stale-closure bugs after scale recalculation */
    scalesRef?: React.RefObject<{ xScale: ContinuousScale; yScale: ContinuousScale } | null>;
    /** Selected precisions, in selection order; controls hover shape key. */
    selectedPrecisions?: readonly string[];
  },
): void {
  const {
    xScale,
    yScale,
    svgRef,
    tooltip,
    container,
    rulerGroup,
    verticalRuler,
    horizontalRuler,
    isPinned,
    pinTooltip,
    generateTooltipContent,
    trackEvent,
    onPointClick,
    onPointDblClick,
    scalesRef,
    selectedPrecisions,
  } = config;

  points
    .on('mouseenter', function (_event, d) {
      if (isPinned()) return;
      applyHoverState(
        d3.select(this).select('.visible-shape') as any,
        resolveShapeKey(d.precision, selectedPrecisions),
      );
      tooltip.style('opacity', 1).style('display', 'block').style('pointer-events', 'none');
      const curXScale = scalesRef?.current?.xScale ?? xScale;
      const curYScale = scalesRef?.current?.yScale ?? yScale;
      const ct = d3.zoomTransform(svgRef.current!);
      rulerGroup.style('display', 'block');
      verticalRuler
        ?.attr('x1', ct.rescaleX(curXScale)(d.x))
        .attr('x2', ct.rescaleX(curXScale)(d.x));
      horizontalRuler
        ?.attr('y1', ct.rescaleY(curYScale)(d.y))
        .attr('y2', ct.rescaleY(curYScale)(d.y));
      tooltip.html(generateTooltipContent(d, false));
    })
    .on('mousemove', function (event) {
      if (isPinned()) return;
      const [mx, my] = d3.pointer(event, container);
      const pos = computeTooltipPosition(mx, my, tooltip, container);
      tooltip.style('left', `${pos.left}px`).style('top', `${pos.top}px`);
    })
    .on('mouseleave', function (_event, d) {
      if (isPinned()) return;
      applyNormalState(
        d3.select(this).select('.visible-shape') as any,
        resolveShapeKey(d.precision, selectedPrecisions),
      );
      tooltip.style('opacity', 0).style('display', 'none');
      rulerGroup.style('display', 'none');
    })
    .on('click', function (event, d) {
      event.stopPropagation();
      const [mx, my] = d3.pointer(event, container);
      tooltip.html(generateTooltipContent(d, true));
      const pos = computeTooltipPosition(mx, my, tooltip, container);
      tooltip
        .style('left', `${pos.left}px`)
        .style('top', `${pos.top}px`)
        .style('opacity', 1)
        .style('display', 'block')
        .style('pointer-events', 'auto');
      pinTooltip(d, false);
      onPointClick?.(d, tooltip);
      trackEvent?.(String(d.hwKey), d.x, d.y);
    })
    .on('dblclick', function (event, d) {
      if (!onPointDblClick) return;
      event.stopPropagation();
      event.preventDefault();
      onPointDblClick(event, d);
    });
}

/** Compute tooltip left/top, flipping when it would overflow the chart container. */
export function computeTooltipPosition(
  mx: number,
  my: number,
  tooltip:
    | d3.Selection<HTMLDivElement | null, unknown, null, undefined>
    | d3.Selection<HTMLDivElement, unknown, null, undefined>,
  container: HTMLElement,
  offset = 10,
): { left: number; top: number } {
  const node = tooltip.node();
  if (!node) return { left: mx + offset, top: my + offset };

  // Ensure tooltip is measurable
  node.style.display = 'block';

  // Force reflow so we get real dimensions
  const tw = node.getBoundingClientRect().width || node.offsetWidth;
  const th = node.getBoundingClientRect().height || node.offsetHeight;
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const left = mx + offset + tw > cw ? mx - offset - tw : mx + offset;
  const top = my + offset + th > ch ? my - offset - th : my + offset;

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
