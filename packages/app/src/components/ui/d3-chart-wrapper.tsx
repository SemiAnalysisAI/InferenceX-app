'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

const DEFAULT_CHART_INSTRUCTIONS = {
  en: 'Shift+Scroll to zoom • Drag to pan • Double-click to reset • Click a point to pin tooltip',
  zh: '按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置 · 点击数据点固定提示框',
} as const;

/**
 * Shown instead of the Shift+Scroll guidance on touch-primary devices, where
 * useChartZoom only accepts two-finger gestures (one finger scrolls the page).
 */
const TOUCH_CHART_INSTRUCTIONS = {
  en: 'Pinch to zoom • Two-finger drag to pan • Double-tap to reset • Tap a point to pin tooltip',
  zh: '双指捏合以缩放 · 双指拖动以平移 · 双击以重置 · 点按数据点固定提示框',
} as const;

export const TOUCH_PRIMARY_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * Picks the hint to render under a chart. When the chart zooms and the device
 * is touch-primary, the Shift+Scroll guidance (the default, or a chart's own
 * copy, which also describes mouse zooming) is swapped wholesale for the touch
 * version. An explicit empty string (embeds) still renders nothing.
 */
export function resolveChartInstructions(
  instructions: string | undefined,
  locale: Locale,
  useTouchHint: boolean,
): string {
  const resolved = instructions ?? DEFAULT_CHART_INSTRUCTIONS[locale];
  return useTouchHint && resolved ? TOUCH_CHART_INSTRUCTIONS[locale] : resolved;
}

/**
 * Renders the d3 tooltip element via React Portal to document.body so it
 * escapes any parent stacking context (e.g. the chart Card's backdrop-filter
 * creates one, trapping z-index inside it). Position is set as viewport
 * coordinates by the d3 layer.
 */
function PortalTooltip({
  chartId,
  tooltipRef,
  pinned,
}: {
  chartId: string;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  pinned: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const node = (
    <div
      ref={tooltipRef}
      data-chart-tooltip={chartId}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        opacity: pinned ? 1 : 0,
        pointerEvents: pinned ? 'auto' : 'none',
        display: pinned ? 'block' : 'none',
        zIndex: 9999,
      }}
    />
  );
  if (!mounted || typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}

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
  /** Whether d3-zoom is attached; gates the touch-device hint swap. */
  zoomEnabled?: boolean;
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
  instructions,
  zoomEnabled = false,
  testId,
  grabCursor = true,
}: D3ChartWrapperProps) {
  const locale = useLocale();
  const isTouchPrimary = useMediaQuery(TOUCH_PRIMARY_QUERY);
  const resolvedInstructions = resolveChartInstructions(
    instructions,
    locale,
    zoomEnabled && isTouchPrimary,
  );

  return (
    <div id={chartId} data-testid={testId}>
      {caption && <figcaption>{caption}</figcaption>}
      <div className="flex flex-col lg:flex-row w-full">
        <div ref={setContainerRef} className="relative flex-1 min-w-0">
          <div className="relative">
            {/* Stable hook for tests. `[data-testid="scatter-graph"] svg` also
                matches every Lucide icon inside the card — dozens of them —
                so picking "the first svg" silently grabs an icon whenever the
                selected metric renders one above the chart. */}
            <svg
              ref={svgRef}
              data-testid="d3-chart-svg"
              width="100%"
              height={dimensions.height}
              // pan-y lets a one-finger vertical swipe scroll the page while
              // the browser still hands two-finger pinch/drag to d3-zoom.
              style={{ cursor: grabCursor ? 'grab' : undefined, touchAction: 'pan-y' }}
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
            {/* Tooltip is portalled to <body> with position:fixed so it can
                rise above sibling chart cards' stacking contexts. The d3 layer
                writes viewport-coords into style.left/top — see
                computeTooltipPosition. */}
            <PortalTooltip
              chartId={chartId}
              tooltipRef={tooltipRef}
              pinned={Boolean(pinnedPoint)}
            />
            {noDataOverlay}
          </div>
          {resolvedInstructions && (
            <p className="no-export text-xs text-muted-foreground text-center mt-2">
              {resolvedInstructions}
            </p>
          )}
          <div className="overflow-hidden max-h-0">
            <div id={`${chartId}-export`} className="p-4"></div>
          </div>
        </div>
        {legendElement && (
          /* Sizes to the legend content: when the sidebar legend panel is open
             (.sidebar-legend present) the column grows to fit the widest
             legend label (capped) so full names display without truncation,
             while still sitting next to the plot without overlapping it; when
             closed the legend renders only a small reopen button and the
             chart reclaims the width. Height belongs to the legend itself:
             short lists should not reserve an empty chart-height column. */
          <div
            data-slot="chart-legend-wrapper"
            className="w-full lg:w-auto lg:shrink-0 lg:self-start relative mt-3 lg:mt-0 lg:has-[.sidebar-legend]:w-fit lg:has-[.sidebar-legend]:min-w-48 lg:has-[.sidebar-legend]:max-w-96"
          >
            {legendElement}
          </div>
        )}
      </div>
    </div>
  );
}
