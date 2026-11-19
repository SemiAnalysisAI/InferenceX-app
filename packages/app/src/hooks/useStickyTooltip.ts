import * as d3 from 'd3';
import { useCallback, useRef, useState } from 'react';

import { canvasPointLayerOf } from '@/lib/d3-chart/layers/canvas-point-registry';
import { setDotHovered } from '@/lib/d3-chart/pin-ring';

export const useStickyTooltip = <T = any>() => {
  const [pinnedPoint, setPinnedPoint] = useState<T | null>(null);
  const [pinnedPointIsOverlay, setPinnedPointIsOverlay] = useState(false);

  const pinnedPointRef = useRef<T | null>(null);

  const pinTooltip = useCallback((point: T, isOverlay = false) => {
    pinnedPointRef.current = point;
    setPinnedPoint(point);
    setPinnedPointIsOverlay(isOverlay);
  }, []);

  const dismissTooltip = useCallback((deferred = false) => {
    pinnedPointRef.current = null;

    if (deferred) {
      requestAnimationFrame(() => {
        setPinnedPoint(null);
        setPinnedPointIsOverlay(false);
      });
    } else {
      setPinnedPoint(null);
      setPinnedPointIsOverlay(false);
    }
  }, []);

  const isPinned = useCallback(() => pinnedPointRef.current !== null, []);

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

        svg.selectAll('.dot-group').each(function () {
          setDotHovered(this as Element, false);
        });
        canvasPointLayerOf(svgRef.current)?.clearHover();
      }
    },
    [],
  );

  return {
    pinnedPoint,
    pinnedPointIsOverlay,

    pinnedPointRef,

    pinTooltip,
    dismissTooltip,
    isPinned,
    hideTooltipElements,
  };
};
