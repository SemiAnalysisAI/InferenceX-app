'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { zoomEventFilter } from '@/hooks/useChartZoom';
import { useIsCoarsePointer, useIsMobileViewport, useMediaQuery } from '@/hooks/useMediaQuery';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { CHART_TOOLTIP_Z_INDEX } from '@/lib/d3-chart/tooltip-placement';
import { cn } from '@/lib/shared/utils';

const DEFAULT_CHART_INSTRUCTIONS = {
  en: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
  zh: '按住 Shift 滚动以缩放 · 拖动以平移 · 双击以重置',
} as const;

const SHEET_STRINGS = {
  en: { title: 'Point details', close: 'Close point details' },
  zh: { title: '数据点详情', close: '关闭数据点详情' },
} as const;

const SHEET_SWIPE_DISMISS_PX = 64;

const TOUCH_CHART_INSTRUCTIONS = {
  en: 'Pinch to zoom · Two-finger drag to pan · Double-tap to reset',
  zh: '双指捏合以缩放 · 双指拖动以平移 · 双击以重置',
} as const;

export const TOUCH_PRIMARY_QUERY = '(hover: none) and (pointer: coarse)';

export function resolveChartInstructions(
  instructions: string | undefined,
  locale: Locale,
  zoomEnabled: boolean,
  touchPrimary: boolean,
): string {
  if (!zoomEnabled) return instructions ?? '';
  if (touchPrimary && instructions !== '') return TOUCH_CHART_INSTRUCTIONS[locale];
  return instructions ?? DEFAULT_CHART_INSTRUCTIONS[locale];
}

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
  const isTouch = useIsCoarsePointer();
  const sheet = pinned && isMobile && isTouch;

  const onSheetDismissRef = useRef(onSheetDismiss);
  onSheetDismissRef.current = onSheetDismiss;

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
        zIndex: CHART_TOOLTIP_Z_INDEX,
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
  plotTop?: number;
  pinnedPoint: unknown | null;
  details?: React.ReactNode;
  onDetailsClose?: () => void;
  isPinned: () => boolean;
  dismissTooltip: () => void;
  hideTooltipElements: (
    tooltipRef: React.RefObject<HTMLDivElement | null>,
    svgRef: React.RefObject<SVGSVGElement | null>,
  ) => void;
  legendElement: React.ReactNode;
  noDataOverlay?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  instructions?: string;
  zoomEnabled?: boolean;
  testId?: string;
  grabCursor?: boolean;
  scrollablePlot?: { minWidth: number; label: string; enabled: boolean };
}

export function D3ChartWrapper({
  chartId,
  svgRef,
  tooltipRef,
  setContainerRef,
  dimensions,
  plotTop = 0,
  pinnedPoint,
  details,
  onDetailsClose,
  isPinned,
  dismissTooltip,
  hideTooltipElements,
  legendElement,
  noDataOverlay,
  caption,
  footer,
  instructions,
  zoomEnabled = false,
  testId,
  grabCursor = true,
  scrollablePlot,
}: D3ChartWrapperProps) {
  const locale = useLocale();
  const isTouchPrimary = useMediaQuery(TOUCH_PRIMARY_QUERY);
  const resolvedInstructions = resolveChartInstructions(
    instructions,
    locale,
    zoomEnabled,
    isTouchPrimary,
  );

  const hasDetails = Boolean(details);
  const onDetailsCloseRef = useRef(onDetailsClose);
  onDetailsCloseRef.current = onDetailsClose;
  const legendSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pinnedPoint) return;

    const dismiss = () => {
      if (hasDetails && onDetailsCloseRef.current) onDetailsCloseRef.current();
      else dismissTooltip();
      hideTooltipElements(tooltipRef, svgRef);
    };
    const inPopper = (target: EventTarget | null) =>
      target instanceof Element && target.closest('[data-radix-popper-content-wrapper]') !== null;
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // Point switching and empty-plot clicks already belong to the chart.
      if (svgRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      // The details panel sits in the legend slot and owns its own close button.
      if (hasDetails && legendSlotRef.current?.contains(target)) return;
      // The mobile backdrop owns its dismissal and stops the underlying click.
      if (target instanceof Element && target.closest('[data-testid="chart-sheet-backdrop"]'))
        return;
      if (inPopper(target)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || inPopper(event.target)) return;
      if (hasDetails) event.preventDefault();
      dismiss();
    };

    // Capture outside clicks even when a page control stops propagation.
    document.addEventListener('click', onOutsideClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('click', onOutsideClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [pinnedPoint, hasDetails, dismissTooltip, hideTooltipElements, tooltipRef, svgRef]);

  const legendWidthRef = useRef(0);
  useLayoutEffect(() => {
    if (!hasDetails && legendSlotRef.current) {
      legendWidthRef.current = legendSlotRef.current.getBoundingClientRect().width;
    }
  });

  // A zoom hint sits in the plot's top-right corner and goes away once the reader zooms or
  // pans; a chart that cannot zoom keeps its hint under the plot.
  const hintInPlot = Boolean(resolvedInstructions) && zoomEnabled;
  const [hintCorner, setHintCorner] = useState({ top: 8, right: 12 });
  const [hintDismissed, setHintDismissed] = useState(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !hintInPlot) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = svg.getBoundingClientRect();
      const xDomain = svg.querySelector('.x-axis > .domain')?.getBoundingClientRect();
      const yDomain = svg.querySelector('.y-axis > .domain')?.getBoundingClientRect();
      const top = Math.max(0, Math.round((yDomain?.top ?? bounds.top) - bounds.top)) + 8;
      const right = Math.max(0, Math.round(bounds.right - (xDomain?.right ?? bounds.right))) + 12;
      setHintCorner((current) =>
        current.top === top && current.right === right ? current : { top, right },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    const mutations = new MutationObserver(schedule);
    mutations.observe(svg, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
    };
  }, [svgRef, hintInPlot]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !hintInPlot || hintDismissed) return;
    // Only the gestures the chart's own zoom accepts count, so page scrolling, browser
    // pinch-zoom and one-finger swipes leave the hint in place.
    const dismiss = () => setHintDismissed(true);
    let dragStart: { x: number; y: number } | null = null;
    const onGesture = (event: WheelEvent | MouseEvent | TouchEvent) => {
      if (zoomEventFilter(event)) dismiss();
    };
    const onMouseDown = (event: MouseEvent) => {
      dragStart = zoomEventFilter(event) ? { x: event.clientX, y: event.clientY } : null;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4)
        dismiss();
    };
    const onMouseUp = () => {
      dragStart = null;
    };
    svg.addEventListener('wheel', onGesture, { passive: true });
    svg.addEventListener('dblclick', onGesture);
    svg.addEventListener('touchmove', onGesture, { passive: true });
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      svg.removeEventListener('wheel', onGesture);
      svg.removeEventListener('dblclick', onGesture);
      svg.removeEventListener('touchmove', onGesture);
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [svgRef, hintInPlot, hintDismissed]);

  const plot = (
    <div
      className={cn('flex flex-col w-full', legendElement && 'lg:flex-row')}
      style={scrollablePlot ? { minWidth: scrollablePlot.minWidth } : undefined}
    >
      <div ref={setContainerRef} className="relative flex-1 min-w-0">
        <div className="relative">
          <svg
            ref={svgRef}
            data-testid="d3-chart-svg"
            width="100%"
            height={dimensions.height}
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
          <PortalTooltip
            chartId={chartId}
            tooltipRef={tooltipRef}
            pinned={Boolean(pinnedPoint) && !hasDetails}
            onSheetDismiss={() => {
              dismissTooltip();
              hideTooltipElements(tooltipRef, svgRef);
            }}
          />
          {noDataOverlay}
          {hintInPlot && (
            <p
              data-testid="chart-instructions"
              data-dismissed={hintDismissed ? '' : undefined}
              aria-hidden={hintDismissed || undefined}
              className={cn(
                'no-export pointer-events-none absolute max-w-[60%] text-right text-2xs leading-4 text-balance text-muted-foreground/80 transition-opacity duration-300',
                hintDismissed && 'opacity-0',
              )}
              style={hintCorner}
            >
              {resolvedInstructions}
            </p>
          )}
        </div>
        {resolvedInstructions && !hintInPlot && (
          <p
            data-testid="chart-instructions"
            className="no-export mt-2 text-center text-xs text-balance text-muted-foreground"
          >
            {resolvedInstructions}
          </p>
        )}
        <div className="overflow-hidden max-h-0">
          <div id={`${chartId}-export`} className="p-4"></div>
        </div>
      </div>
      {(legendElement || hasDetails) && (
        <div
          ref={legendSlotRef}
          data-slot="chart-legend-wrapper"
          className={cn(
            'relative mt-3 w-full',
            legendElement
              ? cn(
                  'lg:max-w-96 lg:shrink-0 lg:mt-[var(--chart-legend-top)]',
                  hasDetails ? 'lg:self-start' : 'lg:self-stretch',
                )
              : 'max-w-96',
            legendElement &&
              (hasDetails
                ? 'lg:w-[var(--chart-legend-width)]'
                : 'lg:w-auto lg:has-[.sidebar-legend]:w-fit lg:has-[.sidebar-legend]:min-w-48'),
          )}
          style={
            {
              '--chart-legend-top': `${plotTop}px`,
              '--chart-legend-width': `${legendWidthRef.current || 288}px`,
            } as React.CSSProperties
          }
        >
          {details}
          <div
            className={
              hasDetails
                ? 'hidden'
                : 'contents lg:flex lg:h-0 lg:min-h-full lg:flex-col lg:overflow-y-auto'
            }
          >
            {legendElement}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div id={chartId} data-testid={testId}>
      {caption && <figcaption>{caption}</figcaption>}
      {scrollablePlot ? (
        <>
          {scrollablePlot.enabled && (
            <p className="no-export text-xs text-muted-foreground mb-2">{scrollablePlot.label}</p>
          )}
          <div
            data-chart-scroll
            className={
              scrollablePlot.enabled
                ? 'overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-ring'
                : undefined
            }
            tabIndex={scrollablePlot.enabled ? 0 : undefined}
            role={scrollablePlot.enabled ? 'region' : undefined}
            aria-label={scrollablePlot.enabled ? scrollablePlot.label : undefined}
            onKeyDown={(event) => {
              if (!scrollablePlot.enabled) return;
              if (event.target !== event.currentTarget) return;
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              event.currentTarget.scrollBy({
                left: (event.key === 'ArrowRight' ? 1 : -1) * event.currentTarget.clientWidth * 0.8,
              });
            }}
          >
            {plot}
          </div>
        </>
      ) : (
        plot
      )}
      {footer && <div data-slot="chart-footer">{footer}</div>}
    </div>
  );
}
