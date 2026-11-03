import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResponsiveChartDimensionsOptions {
  height?: number;
}

export interface UseResponsiveChartDimensionsResult {
  dimensions: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  setContainerRef: (element: HTMLDivElement | null) => void;
}

export const RESIZE_COALESCE_MS = 100;

export function useResponsiveChartDimensions(
  options: UseResponsiveChartDimensionsOptions = {},
): UseResponsiveChartDimensionsResult {
  const { height = 600 } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const heightRef = useRef(height);
  heightRef.current = height;
  const appliedWidthRef = useRef(0);
  const pendingWidthRef = useRef<number | null>(null);
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateDimensions = useCallback((width: number) => {
    appliedWidthRef.current = width;
    const h = heightRef.current;
    setDimensions((prev) =>
      prev.width === width && prev.height === h ? prev : { width, height: h },
    );
  }, []);

  const cancelCoalescing = useCallback(() => {
    clearTimeout(coalesceTimerRef.current ?? undefined);
    coalesceTimerRef.current = null;
    pendingWidthRef.current = null;
  }, []);

  const observeWidth = useCallback(
    (width: number) => {
      if (coalesceTimerRef.current !== null) {
        pendingWidthRef.current = width;
        return;
      }
      if (width === appliedWidthRef.current) return;
      updateDimensions(width);
      const flush = () => {
        const pending = pendingWidthRef.current;
        pendingWidthRef.current = null;
        if (pending === null || pending === appliedWidthRef.current) {
          coalesceTimerRef.current = null;
          return;
        }
        updateDimensions(pending);
        coalesceTimerRef.current = setTimeout(flush, RESIZE_COALESCE_MS);
      };
      coalesceTimerRef.current = setTimeout(flush, RESIZE_COALESCE_MS);
    },
    [updateDimensions],
  );

  const setContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      cancelCoalescing();

      containerRef.current = element;

      if (element) {
        updateDimensions(element.getBoundingClientRect().width);

        resizeObserverRef.current = new ResizeObserver((entries) => {
          if (entries[0]) observeWidth(entries[0].contentRect.width);
        });

        resizeObserverRef.current.observe(element);
      }
    },
    [cancelCoalescing, observeWidth, updateDimensions],
  );

  useEffect(
    () => () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      cancelCoalescing();
    },
    [cancelCoalescing],
  );

  useEffect(() => {
    setDimensions((prev) => (prev.height === height ? prev : { ...prev, height }));
  }, [height]);

  return {
    dimensions,
    containerRef,
    setContainerRef,
  };
}
