import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MIN_HEIGHT = 240;

export interface UseResponsiveChartDimensionsOptions {
  /**
   * Fixed height value for the chart when `observeHeight` is false.
   * @default 600
   */
  height?: number;
  /**
   * When true, chart height follows the container's observed height (clamped
   * to `minHeight`). When false, height is the fixed `height` option.
   */
  observeHeight?: boolean;
  /**
   * Minimum chart height when `observeHeight` is true.
   * @default 240
   */
  minHeight?: number;
}

export interface UseResponsiveChartDimensionsResult {
  dimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  setContainerRef: (element: HTMLDivElement | null) => void;
}

function resolveHeight(
  observeHeight: boolean,
  minHeight: number,
  fixedHeight: number,
  observedWidth: number,
  observedHeight: number,
): { width: number; height: number } {
  const width = observedWidth;
  const height = observeHeight ? Math.max(minHeight, observedHeight) : fixedHeight;
  return { width, height };
}

/**
 * Hook for managing responsive chart dimensions with ResizeObserver.
 * Width always follows the container. Height is either fixed (`height`) or
 * derived from the container when `observeHeight` is true (floored at
 * `minHeight`).
 */
export function useResponsiveChartDimensions(
  options: UseResponsiveChartDimensionsOptions = {},
): UseResponsiveChartDimensionsResult {
  const {
    height: fixedHeight = 600,
    observeHeight = false,
    minHeight = DEFAULT_MIN_HEIGHT,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: fixedHeight });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const setContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      containerRef.current = element;

      if (element) {
        const rect = element.getBoundingClientRect();
        setDimensions(
          resolveHeight(
            observeHeight,
            minHeight,
            fixedHeight,
            rect.width,
            observeHeight ? rect.height : fixedHeight,
          ),
        );

        resizeObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width: observedWidth, height: observedContentHeight } = entry.contentRect;
          setDimensions((prev) => {
            const next = resolveHeight(
              observeHeight,
              minHeight,
              fixedHeight,
              observedWidth,
              observeHeight ? observedContentHeight : fixedHeight,
            );
            if (prev.width === next.width && prev.height === next.height) return prev;
            return next;
          });
        });

        resizeObserverRef.current.observe(element);
      }
    },
    [fixedHeight, observeHeight, minHeight],
  );

  useEffect(
    () => () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    },
    [],
  );

  useEffect(() => {
    if (observeHeight) return;
    setDimensions((prev) => ({ ...prev, height: fixedHeight }));
  }, [fixedHeight, observeHeight]);

  return {
    dimensions,
    containerRef,
    setContainerRef,
  };
}
