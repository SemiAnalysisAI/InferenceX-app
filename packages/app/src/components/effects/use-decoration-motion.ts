'use client';

import { useEffect, useRef } from 'react';

/** Stop decorative timelines offscreen and while the tab is hidden. */
export function useDecorationMotion() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      element.dataset.motion =
        visible && !document.hidden && !preference.matches ? 'running' : 'paused';
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    preference.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      preference.removeEventListener('change', update);
    };
  }, []);
  return ref;
}
