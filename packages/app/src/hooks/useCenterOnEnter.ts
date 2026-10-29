import { useEffect, useRef, type RefObject } from 'react';

export function centeredScrollTop({
  elementTop,
  elementHeight,
  viewportHeight,
  stickyOffset,
  scrollY,
}: {
  elementTop: number;
  elementHeight: number;
  viewportHeight: number;
  stickyOffset: number;
  scrollY: number;
}): number {
  const visibleHeight = viewportHeight - stickyOffset;
  // Elements taller than the visible area align to its top so their heading stays in view.
  const gap = Math.max(0, (visibleHeight - elementHeight) / 2);
  return Math.max(0, scrollY + elementTop - stickyOffset - gap);
}

export function useCenterOnEnter(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
  { enabled, ready }: { enabled: boolean; ready: boolean },
): void {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current) return;
    // A hash link or a user who already scrolled chose their own position.
    if (window.location.hash || window.scrollY > 0) {
      done.current = true;
      return;
    }
    if (!ready) return;
    const target = rootRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    done.current = true;
    const rect = target.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.vt-site-header');
    window.scrollTo({
      top: centeredScrollTop({
        elementTop: rect.top,
        elementHeight: rect.height,
        viewportHeight: window.innerHeight,
        stickyOffset: header?.getBoundingClientRect().height ?? 0,
        scrollY: window.scrollY,
      }),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  });
}
