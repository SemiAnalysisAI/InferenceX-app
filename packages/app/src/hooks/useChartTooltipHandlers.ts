import * as d3 from 'd3';
import { useCallback } from 'react';
import { useStickyTooltip } from './useStickyTooltip';

export type RulerType = 'vertical' | 'horizontal' | 'crosshair' | 'none';

export interface ChartTooltipConfig<TData> {
  /**
   * Type of ruler to display
   * - 'vertical': Single vertical line (for bar charts)
   * - 'crosshair': Both vertical and horizontal lines (for scatter charts)
   */
  rulerType: RulerType;

  /**
   * Function to generate tooltip HTML content
   * @param data - The data point
   * @param isPinned - Whether the tooltip is pinned
   */
  generateTooltipContent: (data: TData, isPinned: boolean) => string;

  /**
   * Function to get X coordinate for ruler positioning
   * For bar charts: typically xScale(label) + bandwidth/2
   * For scatter charts: xScale(data.x)
   */
  getRulerX?: (
    data: TData,
    xScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
  ) => number;

  /**
   * Function to get Y coordinate for ruler positioning (crosshair only)
   * For scatter charts: yScale(data.y)
   */
  getRulerY?: (
    data: TData,
    yScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number, never>
      | d3.ScaleLogarithmic<number, number, never>,
  ) => number;

  /**
   * Optional function to apply hover state to element
   * For scatter charts with custom shapes
   */
  onHoverStart?: (selection: d3.Selection<any, TData, any, any>, data: TData) => void;

  /**
   * Optional function to remove hover state from element
   */
  onHoverEnd?: (selection: d3.Selection<any, TData, any, any>, data: TData) => void;

  /**
   * Optional analytics tracking function called on click
   */
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

  /**
   * Creates ruler elements in the chart
   * @param group - D3 selection of the group to append rulers to
   * @param rulerType - Type of ruler ('vertical' or 'crosshair')
   * @param width - Chart width (for horizontal ruler)
   * @param height - Chart height
   * @param foregroundColor - Color for the ruler lines
   * @returns Object with ruler group and individual ruler selections
   */
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

  /**
   * Attaches tooltip event handlers to a D3 selection
   * @param selection - D3 selection to attach handlers to
   * @param config - Tooltip configuration
   * @param containerElement - Container element for positioning
   * @param tooltipElement - Tooltip div element
   * @param rulers - Ruler elements from createRulers
   * @param xScale - X scale for ruler positioning
   * @param yScale - Y scale for ruler positioning (optional, for crosshairs)
   * @param svgRef - SVG ref for zoom transform (optional, for scatter charts)
   */
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
    yScale?: d3.ScaleLinear<number, number, never> | d3.ScaleLogarithmic<number, number, never>,
    svgRef?: React.RefObject<SVGSVGElement | null>,
    zoomAxes?: 'x' | 'y' | 'both',
  ) => void;
}

/**
 * Hook for managing chart tooltip interactions with rulers/crosshairs
 * Consolidates common tooltip patterns across all D3 charts
 */
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
      // Idempotent: reuse existing ruler group or create new
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
      yScale?: d3.ScaleLinear<number, number, never> | d3.ScaleLogarithmic<number, number, never>,
      svgRef?: React.RefObject<SVGSVGElement | null>,
      zoomAxes?: 'x' | 'y' | 'both',
    ) => {
      const { rulerGroup, verticalRuler, horizontalRuler } = rulers;
      const effectiveZoomAxes = zoomAxes ?? 'both';

      /** Apply zoom transform to scales, respecting which axes are zoomed. */
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

      selection
        .on('mouseenter', function (_event, d) {
          if (isPinned()) return;

          // Apply custom hover state if provided
          if (config.onHoverStart) {
            config.onHoverStart(d3.select(this), d);
          } else {
            // Default: reduce opacity slightly
            d3.select(this).attr('opacity', 0.8);
          }

          // Show tooltip
          tooltipElement
            .style('opacity', 1)
            .style('display', 'block')
            .style('pointer-events', 'none')
            .html(config.generateTooltipContent(d, false));

          // Position rulers
          const { curX: currentXScale, curY: currentYScale } = getZoomedScales();

          if (verticalRuler || horizontalRuler) {
            rulerGroup.style('display', 'block');
          }
          if (verticalRuler && config.getRulerX) {
            const x = config.getRulerX(d, currentXScale);
            verticalRuler.attr('x1', x).attr('x2', x);
          }

          if (horizontalRuler && currentYScale && config.getRulerY) {
            const y = config.getRulerY(d, currentYScale);
            horizontalRuler.attr('y1', y).attr('y2', y);
          }
        })
        .on('mousemove', function (event) {
          if (isPinned()) return;

          const rect = containerElement.getBoundingClientRect();
          tooltipElement
            .style('left', `${event.clientX - rect.left + 10}px`)
            .style('top', `${event.clientY - rect.top + 10}px`);
        })
        .on('mouseleave', function (_event, d) {
          if (isPinned()) return;

          // Remove custom hover state if provided
          if (config.onHoverEnd) {
            config.onHoverEnd(d3.select(this), d);
          } else {
            // Default: restore full opacity
            d3.select(this).attr('opacity', 1);
          }

          tooltipElement.style('opacity', 0).style('display', 'none');
          rulerGroup.style('display', 'none');
        })
        .on('click', function (event, d) {
          event.stopPropagation();

          // Position tooltip near the clicked point
          const rect = containerElement.getBoundingClientRect();
          tooltipElement
            .style('left', `${event.clientX - rect.left + 10}px`)
            .style('top', `${event.clientY - rect.top + 10}px`)
            .style('opacity', 1)
            .style('display', 'block')
            .style('pointer-events', 'auto')
            .html(config.generateTooltipContent(d, true));

          // Position rulers at the clicked point
          const { curX: currentXScale, curY: currentYScale } = getZoomedScales();
          if (verticalRuler || horizontalRuler) {
            rulerGroup.style('display', 'block');
          }
          if (verticalRuler && config.getRulerX) {
            const x = config.getRulerX(d, currentXScale);
            verticalRuler.attr('x1', x).attr('x2', x);
          }
          if (horizontalRuler && currentYScale && config.getRulerY) {
            const y = config.getRulerY(d, currentYScale);
            horizontalRuler.attr('y1', y).attr('y2', y);
          }

          // Pin the tooltip
          pinTooltip(d);

          // Call optional analytics tracking
          if (config.onPointClick) {
            config.onPointClick(d);
          }
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
