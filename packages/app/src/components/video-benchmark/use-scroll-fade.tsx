'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

/**
 * The edges of a sideways scroller that hide content, as its `data-scroll-more` names them:
 * `start`, `end`, both, or none. A pixel of slack absorbs fractional layout widths.
 */
export function scrollMore(scrollLeft: number, clientWidth: number, scrollWidth: number): string {
  return [
    ...(scrollLeft > 1 ? ['start'] : []),
    ...(scrollLeft + clientWidth < scrollWidth - 1 ? ['end'] : []),
  ].join(' ');
}

/**
 * Keeps `data-scroll-more` on a sideways scroller, which results.module.css fades at those
 * edges. The scroller is `root` itself, or the element `selector` finds inside it when a shared
 * component owns the scroller; `dependency` re-reads it when that component remounts it.
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
      scroller.dataset.scrollMore = scrollMore(
        scroller.scrollLeft,
        scroller.clientWidth,
        scroller.scrollWidth,
      );
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
