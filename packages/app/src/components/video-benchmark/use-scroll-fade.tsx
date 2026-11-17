'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

/**
 * Names the edges of a sideways scroller that hide content in its `data-scroll-more` (`start`,
 * `end`, both or none), which results.module.css fades. The scroller is `root`, or the element
 * `selector` finds inside it when a shared component owns the scroller; `dependency` re-reads it
 * when that component remounts it.
 */
export function useScrollFade(
  root: RefObject<HTMLElement | null>,
  selector?: string,
  dependency?: unknown,
) {
  useEffect(() => {
    const scroller = selector ? root.current?.querySelector<HTMLElement>(selector) : root.current;
    if (!scroller) return undefined;
    const read = () => {
      // A pixel of slack absorbs fractional layout widths.
      const start = scroller.scrollLeft > 1;
      const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      scroller.dataset.scrollMore = [start && 'start', end && 'end'].filter(Boolean).join(' ');
    };
    read();
    scroller.addEventListener('scroll', read, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener('scroll', read);
      observer?.disconnect();
      delete scroller.dataset.scrollMore;
    };
  }, [root, selector, dependency]);
}

/** A sideways scroller of its own, such as a wide table inside a card. */
export function ScrollFade({ className, children }: { className: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller);
  return (
    <div ref={scroller} className={className}>
      {children}
    </div>
  );
}
