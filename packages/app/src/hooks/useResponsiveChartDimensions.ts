import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResponsiveChartDimensionsOptions {
  /**
   * Fixed height value for the chart.
   * @default 600
   */
  height?: number;
}

export interface UseResponsiveChartDimensionsResult {
  dimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  setContainerRef: (element: HTMLDivElement | null) => void;
}

/**
 * Hook for managing responsive chart dimensions with ResizeObserver.
 * Provides a containerRef and dimensions state that automatically updates
 * when the container width changes. Height is fixed.
 *
 * @example
 * const { dimensions, setContainerRef } = useResponsiveChartDimensions({
 *   height: 600,
 * });
 */
export function useResponsiveChartDimensions(
  options: UseResponsiveChartDimensionsOptions = {},
): UseResponsiveChartDimensionsResult {
  const { height = 600 } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ref callback for initial dimension calculation and ResizeObserver setup
  const setContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      // clean up previous observer if container changed
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      containerRef.current = element;

      if (element) {
        // set initial dimensions
        const initialWidth = element.getBoundingClientRect().width;
        setDimensions({ width: initialWidth, height });

        // set up ResizeObserver
        resizeObserverRef.current = new ResizeObserver((entries) => {
          if (entries[0]) {
            const { width: observedWidth } = entries[0].contentRect;
            setDimensions({ width: observedWidth, height });
          }
        });

        resizeObserverRef.current.observe(element);
      }
    },
    [height],
  );

  // clean up on unmount or height change
  useEffect(
    () => () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    },
    [],
  );

  // Sync the height prop into dimensions whenever it changes, preserving the
  // independently-observed width. Done during render with a prev-prop comparison
  // instead of an effect so the new height commits in the same render.
  const [prevHeight, setPrevHeight] = useState(height);
  if (height !== prevHeight) {
    setPrevHeight(height);
    setDimensions((prev) => ({ ...prev, height }));
  }

  return {
    dimensions,
    containerRef,
    setContainerRef,
  };
}
