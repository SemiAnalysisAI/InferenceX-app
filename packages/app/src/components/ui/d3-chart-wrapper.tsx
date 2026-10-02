'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useLocale } from '@/lib/use-locale';

const DEFAULT_CHART_INSTRUCTIONS = {
  en: 'Shift+Scroll to zoom • Drag to pan • Double-click to reset • Click a point to pin tooltip',
  zh: '按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置 · 点击数据点固定提示框',
} as const;

const SHEET_STRINGS = {
  en: { title: 'Point details', close: 'Close point details' },
  zh: { title: '数据点详情', close: '关闭数据点详情' },
} as const;

/** Downward swipe distance (px) that dismisses the mobile detail sheet. */
const SHEET_SWIPE_DISMISS_PX = 64;

/**
 * Renders the d3 tooltip element via React Portal to document.body so it
 * escapes any parent stacking context (e.g. the chart Card's backdrop-filter
 * creates one, trapping z-index inside it). Position is set as viewport
 * coordinates by the d3 layer.
 *
 * On phones a pinned tooltip is presented as a bottom sheet (`data-sheet`,
 * styled in globals.css) over a dimmed backdrop: the full per-point metrics
 * and the View charts / View logs actions stay reachable without covering
 * the plot or running off-screen. Tapping the backdrop or swiping the sheet
 * down dismisses it.
 */
function PortalTooltip({
  chartId,
  tooltipRef,
  pinned,
  onSheetDismiss,
}: {
  chartId: string;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  pinned: boolean;
  onSheetDismiss: () => void;
}) {
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMobile = useIsMobileViewport();
  const sheet = pinned && isMobile;

  const onSheetDismissRef = useRef(onSheetDismiss);
  onSheetDismissRef.current = onSheetDismiss;

  // Swipe-down-to-dismiss, only when the sheet is scrolled to its top so the
  // gesture never fights scrolling through a long metrics list.
  useEffect(() => {
    const el = tooltipRef.current;
    if (!sheet || !el) return;
    let startY: number | null = null;
    const onStart = (event: TouchEvent) => {
      startY = el.scrollTop <= 0 && event.touches.length === 1 ? event.touches[0]!.clientY : null;
    };
    const onEnd = (event: TouchEvent) => {
      if (startY === null) return;
      const originY = startY;
      startY = null;
      const endY = event.changedTouches[0]?.clientY ?? originY;
      if (endY - originY > SHEET_SWIPE_DISMISS_PX) onSheetDismissRef.current();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [sheet, tooltipRef]);

  // Escape closes the sheet for keyboard and switch-access users.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSheetDismissRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const node = (
    <div
      ref={tooltipRef}
      data-chart-tooltip={chartId}
      data-sheet={sheet ? 'true' : undefined}
      role={sheet ? 'dialog' : undefined}
      aria-modal={sheet ? false : undefined}
      aria-label={sheet ? SHEET_STRINGS[locale].title : undefined}
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
  return createPortal(
    <>
      {sheet && (
        <button
          type="button"
          data-testid="chart-sheet-backdrop"
          aria-label={SHEET_STRINGS[locale].close}
          onClick={(event) => {
            event.stopPropagation();
            onSheetDismissRef.current();
          }}
          className="fixed inset-0 z-[9998] cursor-default bg-black/45 backdrop-blur-[1px] animate-in fade-in-0 duration-200 md:hidden"
        />
      )}
      {node}
    </>,
    document.body,
  );
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
  testId,
  grabCursor = true,
}: D3ChartWrapperProps) {
  const locale = useLocale();
  const resolvedInstructions = instructions ?? DEFAULT_CHART_INSTRUCTIONS[locale];

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
            {/* Tooltip is portalled to <body> with position:fixed so it can
                rise above sibling chart cards' stacking contexts. The d3 layer
                writes viewport-coords into style.left/top — see
                computeTooltipPosition. */}
            <PortalTooltip
              chartId={chartId}
              tooltipRef={tooltipRef}
              pinned={Boolean(pinnedPoint)}
              onSheetDismiss={() => {
                dismissTooltip();
                hideTooltipElements(tooltipRef, svgRef);
              }}
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
