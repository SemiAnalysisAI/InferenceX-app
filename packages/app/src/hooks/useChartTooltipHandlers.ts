import * as d3 from 'd3';
import { useCallback } from 'react';
import {
  computeTooltipPosition,
  getTooltipContainerGeometry,
  invalidateTooltipGeometry,
} from '@/lib/d3-chart/layers/scatter-points';
import { installTouchInputTracking, isTouchCompatMouseEvent } from '@/lib/d3-chart/touch-input';
import { useStickyTooltip } from './useStickyTooltip';

import { overlayMarkerPosition } from '@/lib/d3-chart/overlay-x-marker';
import { canvasPointLayerOf } from '@/lib/d3-chart/layers/canvas-points';
export type RulerType = 'vertical' | 'horizontal' | 'crosshair' | 'none';

export interface ChartTooltipConfig<TData> {
  rulerType: RulerType;

  generateTooltipContent: (data: TData, isPinned: boolean) => string;

  getRulerX?: (
    data: TData,
    xScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
  ) => number;

  getRulerY?: (
    data: TData,
    yScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
  ) => number;

  onHoverStart?: (selection: d3.Selection<any, TData, any, any>, data: TData) => void;

  onHoverEnd?: (selection: d3.Selection<any, TData, any, any>, data: TData) => void;

  onPointClick?: (data: TData) => void;
}

export interface ChartTooltipHandlers<TData> {
  pinnedPoint: TData | null;
  pinnedPointIsOverlay: boolean;
  pinTooltip: (data: TData, isOverlay?: boolean) => void;
  dismissTooltip: (clearPinnedPoint?: boolean) => void;
  isPinned: () => boolean;
  hideTooltipElements: (
    tooltipRef: React.RefObject<HTMLDivElement | null>,
    svgRef: React.RefObject<SVGSVGElement | null>,
  ) => void;

  createRulers: (
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    rulerType: RulerType,
    width: number,
    height: number,
    foregroundColor: string,
  ) => {
    rulerGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    verticalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
    horizontalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
  };

  attachHandlers: (
    selection: d3.Selection<any, TData, any, any>,
    config: ChartTooltipConfig<TData>,
    containerElement: HTMLDivElement,
    tooltipElement: d3.Selection<any, unknown, any, any>,
    rulers: {
      rulerGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
      verticalRuler: d3.Selection<SVGLineElement, unknown, null, undefined>;
      horizontalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
    },
    xScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
    yScale?:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
    svgRef?: React.RefObject<SVGSVGElement | null>,
    zoomAxes?: 'x' | 'y' | 'both',
  ) => void;
}

export function useChartTooltipHandlers<TData>(): ChartTooltipHandlers<TData> {
  const {
    pinnedPoint,
    pinnedPointIsOverlay,
    pinTooltip,
    dismissTooltip,
    isPinned,
    hideTooltipElements,
  } = useStickyTooltip<TData>();

  const createRulers = useCallback(
    (
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      rulerType: RulerType,
      width: number,
      height: number,
      foregroundColor: string,
    ) => {
      let rulerGroup = group.select<SVGGElement>('.ruler-group');
      if (rulerGroup.empty()) {
        rulerGroup = group.append('g').attr('class', 'ruler-group').style('pointer-events', 'none');
      }
      rulerGroup.style('display', 'none');

      let verticalRuler: d3.Selection<SVGLineElement, unknown, null, undefined> | undefined;

      if (rulerType !== 'horizontal' && rulerType !== 'none') {
        let vRuler = rulerGroup.select<SVGLineElement>('.vertical-ruler');
        if (vRuler.empty()) {
          vRuler = rulerGroup
            .append('line')
            .attr('class', 'vertical-ruler')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 4')
            .attr('opacity', 0.8);
        }
        vRuler.attr('stroke', foregroundColor).attr('y1', 0).attr('y2', height);
        verticalRuler = vRuler;
      }

      let horizontalRuler: d3.Selection<SVGLineElement, unknown, null, undefined> | undefined;

      if (rulerType === 'crosshair' || rulerType === 'horizontal') {
        let hRuler = rulerGroup.select<SVGLineElement>('.horizontal-ruler');
        if (hRuler.empty()) {
          hRuler = rulerGroup
            .append('line')
            .attr('class', 'horizontal-ruler')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 4')
            .attr('opacity', 0.8);
        }
        hRuler.attr('stroke', foregroundColor).attr('x1', 0).attr('x2', width);
        horizontalRuler = hRuler;
      }

      return { rulerGroup, verticalRuler, horizontalRuler };
    },
    [],
  );

  const attachHandlers = useCallback(
    (
      selection: d3.Selection<any, TData, any, any>,
      config: ChartTooltipConfig<TData>,
      containerElement: HTMLDivElement,
      tooltipElement: d3.Selection<any, unknown, any, any>,
      rulers: {
        rulerGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
        verticalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
        horizontalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
      },
      xScale:
        | d3.ScaleBand<string>
        | d3.ScaleLinear<number, number, never>
        | d3.ScaleLogarithmic<number, number, never>,
      yScale?:
        | d3.ScaleBand<string>
        | d3.ScaleLinear<number, number, never>
        | d3.ScaleLogarithmic<number, number, never>,
      svgRef?: React.RefObject<SVGSVGElement | null>,
      zoomAxes: 'x' | 'y' | 'both' = 'both',
    ) => {
      const { rulerGroup, verticalRuler, horizontalRuler } = rulers;
      const effectiveZoomAxes = zoomAxes;

      const getZoomedScales = () => {
        let curX = xScale;
        let curY = yScale;
        if (svgRef?.current) {
          const transform = d3.zoomTransform(svgRef.current);
          if ((effectiveZoomAxes === 'x' || effectiveZoomAxes === 'both') && 'invert' in xScale) {
            curX = transform.rescaleX(xScale as any);
          }
          if (
            (effectiveZoomAxes === 'y' || effectiveZoomAxes === 'both') &&
            yScale &&
            'invert' in yScale
          ) {
            curY = transform.rescaleY(yScale as any);
          }
        }
        return { curX, curY };
      };

      installTouchInputTracking();

      const showRulers = (datum: TData, markerPosition: { x: number; y: number } | null) => {
        const { curX: currentXScale, curY: currentYScale } = getZoomedScales();
        if (verticalRuler || horizontalRuler) {
          rulerGroup.style('display', 'block');
        }
        if (verticalRuler && config.getRulerX) {
          const x = markerPosition?.x ?? config.getRulerX(datum, currentXScale);
          verticalRuler.attr('x1', x).attr('x2', x);
        }
        if (horizontalRuler && currentYScale && config.getRulerY) {
          const y = markerPosition?.y ?? config.getRulerY(datum, currentYScale);
          horizontalRuler.attr('y1', y).attr('y2', y);
        }
      };

      const hoverStart = (
        event: MouseEvent,
        target: d3.Selection<any, TData, any, any>,
        d: TData,
        markerPosition: { x: number; y: number } | null,
      ): boolean => {
        if (isPinned()) return false;
        if (isTouchCompatMouseEvent(event)) return false;
        if (config.onHoverStart) {
          config.onHoverStart(target, d);
        } else {
          target.attr('opacity', 0.8);
        }
        tooltipElement
          .style('opacity', 1)
          .style('display', 'block')
          .style('pointer-events', 'none')
          .html(config.generateTooltipContent(d, false));
        invalidateTooltipGeometry(tooltipElement.node());
        showRulers(d, markerPosition);
        return true;
      };

      const hoverMove = (event: MouseEvent) => {
        if (isPinned()) return;
        if (isTouchCompatMouseEvent(event)) return;
        const geometry = getTooltipContainerGeometry(containerElement);
        const mx = event.clientX - geometry.bounds.left;
        const my = event.clientY - geometry.bounds.top;
        const pos = computeTooltipPosition(mx, my, tooltipElement, containerElement, 10, geometry);
        tooltipElement.style('left', `${pos.left}px`).style('top', `${pos.top}px`);
      };

      const hoverEnd = (target: d3.Selection<any, TData, any, any>, d: TData): boolean => {
        if (isPinned()) return false;
        if (config.onHoverEnd) {
          config.onHoverEnd(target, d);
        } else {
          target.attr('opacity', 1);
        }
        tooltipElement.style('opacity', 0).style('display', 'none');
        rulerGroup.style('display', 'none');
        return true;
      };

      const pointClick = (
        event: MouseEvent,
        d: TData,
        markerPosition: { x: number; y: number } | null,
      ) => {
        event.stopPropagation();
        const geometry = getTooltipContainerGeometry(containerElement);
        const mx = event.clientX - geometry.bounds.left;
        const my = event.clientY - geometry.bounds.top;
        tooltipElement.html(config.generateTooltipContent(d, true));
        invalidateTooltipGeometry(tooltipElement.node());
        const pos = computeTooltipPosition(mx, my, tooltipElement, containerElement, 10, geometry);
        tooltipElement
          .style('left', `${pos.left}px`)
          .style('top', `${pos.top}px`)
          .style('opacity', 1)
          .style('display', 'block')
          .style('pointer-events', 'auto');
        showRulers(d, markerPosition);
        pinTooltip(d);
        config.onPointClick?.(d);
      };

      const canvasPoints = canvasPointLayerOf(selection.node());
      if (canvasPoints) {
        canvasPoints.listen({
          enter: (event, datum, position) =>
            hoverStart(event, selection, datum as unknown as TData, position),
          move: hoverMove,
          leave: (_event, datum) => hoverEnd(selection, datum as unknown as TData),
          click: (event, datum, position) => pointClick(event, datum as unknown as TData, position),
        });
        return;
      }

      selection
        .on('mouseenter', function (event, d) {
          const markerPosition = this instanceof Element ? overlayMarkerPosition(this) : null;
          hoverStart(event, d3.select(this), d, markerPosition);
        })
        .on('mousemove', hoverMove)
        .on('mouseleave', function (_event, d) {
          hoverEnd(d3.select(this), d);
        })
        .on('click', function (event, d) {
          pointClick(event, d, this instanceof Element ? overlayMarkerPosition(this) : null);
        });
    },
    [isPinned, pinTooltip],
  );

  return {
    pinnedPoint,
    pinnedPointIsOverlay,
    pinTooltip,
    dismissTooltip,
    isPinned,
    hideTooltipElements,
    createRulers,
    attachHandlers,
  };
}
