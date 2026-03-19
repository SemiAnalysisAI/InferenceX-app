import * as d3 from 'd3';
import { useCallback, useRef, useState } from 'react';

import { applyNormalState } from '@/lib/chart-rendering';

/**
 * Custom hook for managing sticky tooltip state in D3 charts.
 *
 * This hook provides both React state and a ref for tracking pinned tooltip state.
 * The ref is used in D3 event handlers to avoid stale closures and re-render cascades,
 * while the state is used for React rendering.
 *
 * @returns Sticky tooltip state and helper functions
 */
export const useStickyTooltip = <T = any>() => {
  // react state for rendering
  const [pinnedPoint, setPinnedPoint] = useState<T | null>(null);
  const [pinnedPointIsOverlay, setPinnedPointIsOverlay] = useState(false);

  // ref for d3 event handlers
  const pinnedPointRef = useRef<T | null>(null);

  /**
   * Pins a tooltip to a specific data point.
   * Updates both the ref (for D3 handlers) and state (for React rendering).
   */
  const pinTooltip = useCallback((point: T, isOverlay = false) => {
    pinnedPointRef.current = point;
    setPinnedPoint(point);
    setPinnedPointIsOverlay(isOverlay);
  }, []);

  /**
   * Dismisses the pinned tooltip.
   * Can be called synchronously (for immediate D3 updates) or deferred (during zoom/pan).
   *
   * @param deferred - If true, defers the state update via requestAnimationFrame to avoid re-render cascades during zoom/pan
   */
  const dismissTooltip = useCallback((deferred = false) => {
    pinnedPointRef.current = null;

    if (deferred) {
      // defer state update to avoid re-render during zoom
      requestAnimationFrame(() => {
        setPinnedPoint(null);
        setPinnedPointIsOverlay(false);
      });
    } else {
      setPinnedPoint(null);
      setPinnedPointIsOverlay(false);
    }
  }, []);

  /**
   * Checks if a tooltip is currently pinned.
   * Uses the ref for D3 event handlers to get the most current value.
   */
  const isPinned = useCallback(() => {
    return pinnedPointRef.current !== null;
  }, []);

  /**
   * Hides the tooltip and guide elements visually (for D3 elements).
   * This should be called alongside dismissTooltip when dismissing from D3 handlers.
   * Handles both ruler-group (bar charts, scatter) and cursor-line (time series) elements.
   */
  const hideTooltipElements = useCallback(
    (
      tooltipRef: React.RefObject<HTMLDivElement | null>,
      svgRef: React.RefObject<SVGSVGElement | null>,
    ) => {
      if (tooltipRef.current) {
        tooltipRef.current.style.opacity = '0';
        tooltipRef.current.style.display = 'none';
        tooltipRef.current.style.pointerEvents = 'none';
      }

      if (svgRef.current) {
        const svg = d3.select(svgRef.current);
        svg.select('.ruler-group').style('display', 'none');
        svg.select('.cursor-line').style('opacity', '0');

        // Reset any scatter points stuck in hover state back to normal
        svg.selectAll('.dot-group').each(function () {
          const group = d3.select(this);
          const datum = group.datum() as { precision?: string } | null;
          if (datum?.precision) {
            applyNormalState(group.select('.visible-shape') as any, datum.precision);
          }
        });
      }
    },
    [],
  );

  return {
    // state for react rendering
    pinnedPoint,
    pinnedPointIsOverlay,

    // ref for d3 event handlers
    pinnedPointRef,

    // actions
    pinTooltip,
    dismissTooltip,
    isPinned,
    hideTooltipElements,
  };
};
