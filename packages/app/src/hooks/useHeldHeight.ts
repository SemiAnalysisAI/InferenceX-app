import { useCallback, useLayoutEffect, useRef } from 'react';

function applyHeldHeight(element: HTMLElement, hold: boolean, height: number) {
  element.style.minHeight = hold && height > 0 ? `${height}px` : '';
}

/**
 * While `hold` is true, keeps the element at least as tall as it last rendered
 * with `hold` false. A refetch that swaps content for a shorter loading state
 * then no longer pulls the content below it up and pushes it back down when the
 * data returns, which browsers count as layout shift.
 */
export function useHeldHeight<T extends HTMLElement>(hold: boolean) {
  const element = useRef<T | null>(null);
  const lastHeight = useRef(0);
  const holding = useRef(hold);

  const ref = useCallback((node: T | null) => {
    element.current = node;
    if (!node || typeof ResizeObserver === 'undefined') return;
    applyHeldHeight(node, holding.current, lastHeight.current);
    const observer = new ResizeObserver((entries) => {
      if (holding.current) return;
      const entry = entries.at(-1);
      const height = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect.height;
      if (height !== undefined) lastHeight.current = height;
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      element.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    holding.current = hold;
    if (element.current) applyHeldHeight(element.current, hold, lastHeight.current);
  }, [hold]);

  return ref;
}
