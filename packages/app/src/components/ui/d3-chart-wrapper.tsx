'use client';

import React from 'react';

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
  noDataOverlay?: React.ReactNode;
  caption?: React.ReactNode;
  instructions?: string;
  testId?: string;
  grabCursor?: boolean;
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
  noDataOverlay,
  caption,
  instructions = 'Shift+Scroll to zoom • Drag to pan • Double-click to reset • Click a point to pin tooltip',
  testId,
  grabCursor = true,
}: D3ChartWrapperProps) {
  return (
    <div id={chartId} data-testid={testId}>
      {caption && <figcaption>{caption}</figcaption>}
      <div className="flex flex-col lg:flex-row w-full">
        <div ref={setContainerRef} className="relative flex-1 min-w-0">
          <div className="relative">
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
          </div>
          <p className="no-export text-xs text-muted-foreground text-center mt-2">{instructions}</p>
          <div className="overflow-hidden max-h-0">
            <div id={`${chartId}-export`} className="p-4"></div>
          </div>
        </div>
        {legendElement && (
          <div className="w-full h-96 lg:h-[575px] lg:w-48 lg:shrink-0 relative mt-3 lg:mt-0">
            {legendElement}
          </div>
        )}
      </div>
    </div>
  );
}
