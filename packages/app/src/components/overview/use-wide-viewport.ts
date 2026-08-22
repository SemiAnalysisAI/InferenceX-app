import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 80rem)';

const NOOP = () => {};

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return NOOP;
  const mediaQuery = window.matchMedia(QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(QUERY).matches
  );
}

function getServerSnapshot(): null {
  return null;
}

/**
 * Tri-state on purpose: the server snapshot is `null`, so server rendering and
 * hydration keep both responsive surfaces mounted. The client snapshot takes
 * over immediately after hydration and subscribes to viewport changes.
 */
export function useWideViewport(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, getServerSnapshot);
}
