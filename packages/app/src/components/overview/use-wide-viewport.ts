import { useEffect, useState } from 'react';

const QUERY = '(min-width: 80rem)';

/**
 * Tri-state on purpose: `null` until the first effect runs, so the server and
 * the hydrating client render both surfaces exactly as the CSS-only version
 * did. Only after hydration is the off-screen one dropped from the tree.
 */
export function useWideViewport(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    setWide(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
