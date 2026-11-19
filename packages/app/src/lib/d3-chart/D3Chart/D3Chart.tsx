'use client';

import React, { useEffect, useImperativeHandle, useRef } from 'react';

import { D3ChartWrapper } from '@/components/ui/d3-chart-wrapper';
import { useChartTooltipHandlers } from '@/hooks/useChartTooltipHandlers';
import { useChartZoom } from '@/hooks/useChartZoom';
import { useResponsiveChartDimensions } from '@/hooks/useResponsiveChartDimensions';

import { DEFAULT_CHART_MARGIN, defaultChartHeight } from '../chart-setup';
import { clearPinRing } from '../pin-ring';

import type { BuiltScale } from './scale-builders';
import type { D3ChartHandle, D3ChartProps } from './types';
import { useD3ChartRenderer } from './useD3ChartRenderer';

function D3ChartInner<T>(
  {
    chartId,
    data,
    height = defaultChartHeight,
    margin = DEFAULT_CHART_MARGIN,
    watermark,
    testId,
    grabCursor = true,
    instructions,
    clipContent,
    dataIdentity,
    metricIdentity,
    displayIdentity,
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
    footer,
    scrollablePlot,
    onRender,
    onExportRender,
    onDisplayUpdate,
  }: D3ChartProps<T>,
  ref: React.ForwardedRef<D3ChartHandle>,
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const scalesRef = useRef<{ xScale: BuiltScale; yScale: BuiltScale } | null>(null);

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
    pinnedPointRef,
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
      getPinnedPoint: () => pinnedPointRef.current,
      getPinnedPointIsOverlay: () => pinnedPointIsOverlay,
      isPinned,
      pinTooltip: pinTooltip as (point: unknown, isOverlay?: boolean) => void,
      getSvgElement: () => svgRef.current,
      getTooltipElement: () => tooltipRef.current,
      getScales: () => scalesRef.current,
    }),
    [
      dismissTooltip,
      hideTooltipElements,
      pinnedPointRef,
      pinnedPointIsOverlay,
      isPinned,
      pinTooltip,
    ],
  );

  useEffect(() => {
    if (!pinnedPoint) clearPinRing(svgRef.current);
  }, [pinnedPoint]);

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
      dataIdentity,
      metricIdentity,
      displayIdentity,
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
      onExportRender,
      onDisplayUpdate,
    },
    {
      svgRef,
      tooltipRef,
      dimensions,
      scalesRef,
      setupZoom,
      zoomTransformRef,
      isPinned,
      pinTooltip,
      pinnedPointRef,
      dismissTooltip,
      hideTooltipElements,
      createRulers,
      attachHandlers,
    },
  );

  const closeDetails = () => dismissTooltip();
  const details =
    pinnedPoint !== null && tooltipConfig?.details
      ? tooltipConfig.details(pinnedPoint, pinnedPointIsOverlay, closeDetails)
      : null;

  return (
    <D3ChartWrapper
      chartId={chartId}
      svgRef={svgRef}
      tooltipRef={tooltipRef}
      setContainerRef={setContainerRef}
      dimensions={dimensions}
      plotTop={margin.top}
      pinnedPoint={pinnedPoint}
      details={details}
      onDetailsClose={closeDetails}
      isPinned={isPinned}
      dismissTooltip={dismissTooltip}
      hideTooltipElements={hideTooltipElements}
      instructions={instructions}
      zoomEnabled={zoomConfig?.enabled ?? false}
      testId={testId}
      grabCursor={grabCursor}
      legendElement={legendElement}
      noDataOverlay={noDataOverlay}
      caption={caption}
      footer={footer}
      scrollablePlot={scrollablePlot}
    />
  );
}

export const D3Chart = React.memo(React.forwardRef(D3ChartInner)) as <T>(
  props: D3ChartProps<T> & { ref?: React.Ref<D3ChartHandle> },
) => React.ReactElement | null;
