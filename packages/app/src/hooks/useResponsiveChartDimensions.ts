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
        const width = element.getBoundingClientRect().width;
        setDimensions({ width, height });

        // set up ResizeObserver
        resizeObserverRef.current = new ResizeObserver((entries) => {
          if (entries[0]) {
            const { width } = entries[0].contentRect;
            setDimensions({ width, height });
          }
        });

        resizeObserverRef.current.observe(element);
      }
    },
    [height],
  );

  // clean up on unmount or height change
  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // update dimensions when height changes
  useEffect(() => {
    setDimensions((prev) => ({ ...prev, height }));
  }, [height]);

  return {
    dimensions,
    containerRef,
    setContainerRef,
  };
}
