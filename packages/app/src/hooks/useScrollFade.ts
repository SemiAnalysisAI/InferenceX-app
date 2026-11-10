import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a horizontally scrolling element still hides content on its right, so the
 * caller can draw an edge fade as a scroll cue.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fade, setFade] = useState(false);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) setFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onScroll();
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [onScroll]);
  return { ref, fade, onScroll };
}
