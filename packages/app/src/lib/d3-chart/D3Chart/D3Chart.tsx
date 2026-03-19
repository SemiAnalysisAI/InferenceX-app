'use client';

import React, { useImperativeHandle, useRef } from 'react';

import { D3ChartWrapper } from '@/components/ui/d3-chart-wrapper';
import { useChartTooltipHandlers } from '@/hooks/useChartTooltipHandlers';
import { useChartZoom } from '@/hooks/useChartZoom';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';

import type { D3ChartHandle, D3ChartProps } from './types';
import { useD3ChartRenderer } from './useD3ChartRenderer';

function D3ChartInner<T>(
  {
    chartId,
    data,
    height = 600,
    margin,
    watermark,
    testId,
    grabCursor = true,
    instructions,
    clipContent,
    xScale: xScaleConfig,
    yScale: yScaleConfig,
    xAxis,
    yAxis,
    layers,
    zoom: zoomConfig,
    tooltip: tooltipConfig,
    transitionDuration,
    legendElement,
    noDataOverlay,
    caption,
    onRender,
  }: D3ChartProps<T>,
  ref: React.ForwardedRef<D3ChartHandle>,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const { dimensions, setContainerRef } = useResponsiveChartDimensions({ height });

  const { zoomTransformRef, setupZoom } = useChartZoom({
    resetEventName: zoomConfig?.resetEventName ?? `d3chart_zoom_reset_${chartId}`,
    defaultZoomK: zoomConfig?.defaultZoomK,
    scaleExtent: zoomConfig?.scaleExtent ?? [1, 20],
    svgRef,
    onReset: zoomConfig?.onReset,
  });

  const {
    pinnedPoint,
    pinnedPointIsOverlay,
    pinTooltip,
    dismissTooltip,
    isPinned,
    hideTooltipElements,
    createRulers,
    attachHandlers,
  } = useChartTooltipHandlers<T>();

  useImperativeHandle(
    ref,
    () => ({
      dismissTooltip,
      hideTooltip: () => {
        hideTooltipElements(tooltipRef, svgRef);
      },
      getPinnedPoint: () => pinnedPoint,
      getPinnedPointIsOverlay: () => pinnedPointIsOverlay,
      isPinned,
      pinTooltip: pinTooltip as (point: unknown, isOverlay?: boolean) => void,
      getSvgElement: () => svgRef.current,
      getTooltipElement: () => tooltipRef.current,
    }),
    [dismissTooltip, hideTooltipElements, pinnedPoint, pinnedPointIsOverlay, isPinned, pinTooltip],
  );

  useD3ChartRenderer(
    {
      chartId,
      data,
      height,
      margin,
      watermark,
      testId,
      grabCursor,
      instructions,
      clipContent,
      xScale: xScaleConfig,
      yScale: yScaleConfig,
      xAxis,
      yAxis,
      layers,
      zoom: zoomConfig,
      tooltip: tooltipConfig,
      transitionDuration,
      legendElement,
      noDataOverlay,
      onRender,
    },
    {
      svgRef,
      tooltipRef,
      dimensions,
      setupZoom,
      zoomTransformRef,
      isPinned,
      dismissTooltip,
      createRulers,
      attachHandlers,
    },
  );

  return (
    <D3ChartWrapper
      chartId={chartId}
      svgRef={svgRef}
      tooltipRef={tooltipRef}
      setContainerRef={setContainerRef}
      dimensions={dimensions}
      pinnedPoint={pinnedPoint}
      isPinned={isPinned}
      dismissTooltip={dismissTooltip}
      hideTooltipElements={hideTooltipElements}
      instructions={instructions}
      testId={testId}
      grabCursor={grabCursor}
      legendElement={legendElement}
      noDataOverlay={noDataOverlay}
      caption={caption}
    />
  );
}

export const D3Chart = React.memo(React.forwardRef(D3ChartInner)) as <T>(
  props: D3ChartProps<T> & { ref?: React.Ref<D3ChartHandle> },
) => React.ReactElement | null;
