'use client';

import React from 'react';

import { cn } from '@/lib/utils';

export interface D3ChartWrapperProps {
  chartId: string;
  svgRef: React.RefObject<SVGSVGElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  setContainerRef: (el: HTMLDivElement | null) => void;
  dimensions: { width: number; height: number };
  pinnedPoint: unknown | null;
  isPinned: () => boolean;
  dismissTooltip: () => void;
  hideTooltipElements: (
    tooltipRef: React.RefObject<HTMLDivElement | null>,
    svgRef: React.RefObject<SVGSVGElement | null>,
  ) => void;
  legendElement: React.ReactNode;
  legendWrapper?: (legend: React.ReactNode) => React.ReactNode;
  /** When true, removes the fixed h-96 on the legend container at narrow widths so it sizes to content. */
  compactLegend?: boolean;
  /**
   * When true, chart + legend fill parent height (embed); chart column observes
   * height for the SVG. Instructions sit below the measured SVG area.
   */
  fillHeight?: boolean;
  noDataOverlay?: React.ReactNode;
  caption?: React.ReactNode;
  instructions?: string;
  testId?: string;
  grabCursor?: boolean;
}

function legendShellClassName(compactLegend: boolean, fillHeight: boolean): string {
  if (compactLegend) {
    return cn(
      // shrink-0 at all breakpoints so the legend bar never collapses over the chart
      // when the chart column is flex-1 in a short viewport (was lg:shrink-0 only).
      'relative mt-3 w-full shrink-0 lg:mt-0 lg:w-48 lg:overflow-hidden',
      fillHeight ? 'lg:h-full' : 'lg:h-[575px]',
    );
  }
  return cn(
    'relative mt-3 h-96 w-full shrink-0 lg:mt-0 lg:w-48',
    fillHeight ? 'lg:h-full lg:overflow-hidden' : 'lg:h-[575px]',
  );
}

export function D3ChartWrapper({
  chartId,
  svgRef,
  tooltipRef,
  setContainerRef,
  dimensions,
  pinnedPoint,
  isPinned,
  dismissTooltip,
  hideTooltipElements,
  legendElement,
  legendWrapper,
  compactLegend = false,
  fillHeight = false,
  noDataOverlay,
  caption,
  instructions = 'Shift+Scroll to zoom • Drag to pan • Double-click to reset • Click a point to pin tooltip',
  testId,
  grabCursor = true,
}: D3ChartWrapperProps) {
  const svgBlock = (
    <>
      <svg
        ref={svgRef}
        width="100%"
        height={dimensions.height}
        style={{ cursor: grabCursor ? 'grab' : undefined }}
        onMouseDown={
          grabCursor
            ? (e) => {
                (e.currentTarget as SVGSVGElement).style.cursor = 'grabbing';
              }
            : undefined
        }
        onMouseUp={
          grabCursor
            ? (e) => {
                (e.currentTarget as SVGSVGElement).style.cursor = 'grab';
              }
            : undefined
        }
        onClick={() => {
          if (isPinned()) {
            dismissTooltip();
            hideTooltipElements(tooltipRef, svgRef);
          }
        }}
      />
      <div
        ref={tooltipRef}
        data-chart-tooltip
        style={{
          position: 'absolute',
          opacity: pinnedPoint ? 1 : 0,
          pointerEvents: pinnedPoint ? 'auto' : 'none',
          display: pinnedPoint ? 'block' : 'none',
          zIndex: 50,
        }}
      />
      {noDataOverlay}
    </>
  );

  if (fillHeight) {
    return (
      <div id={chartId} data-testid={testId} className="flex h-full min-h-0 flex-1 flex-col">
        {caption && <figcaption>{caption}</figcaption>}
        <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={setContainerRef} className="relative min-h-0 min-w-0 flex-1">
              <div className="relative h-full min-h-0 w-full">{svgBlock}</div>
            </div>
            <p
              data-testid={`${chartId}-instructions`}
              className="no-export mt-2 text-center text-xs text-muted-foreground"
            >
              {instructions}
            </p>
            <div className="max-h-0 overflow-hidden">
              <div id={`${chartId}-export`} className="p-4"></div>
            </div>
          </div>
          {legendElement && (
            <div className={legendShellClassName(compactLegend, true)}>
              {legendWrapper ? legendWrapper(legendElement) : legendElement}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id={chartId} data-testid={testId}>
      {caption && <figcaption>{caption}</figcaption>}
      <div className="flex w-full flex-col lg:flex-row">
        <div ref={setContainerRef} className="relative min-w-0 flex-1">
          <div className="relative">{svgBlock}</div>
          <p
            data-testid={`${chartId}-instructions`}
            className="no-export mt-2 text-center text-xs text-muted-foreground"
          >
            {instructions}
          </p>
          <div className="max-h-0 overflow-hidden">
            <div id={`${chartId}-export`} className="p-4"></div>
          </div>
        </div>
        {legendElement && (
          <div className={legendShellClassName(compactLegend, false)}>
            {legendWrapper ? legendWrapper(legendElement) : legendElement}
          </div>
        )}
      </div>
    </div>
  );
}
