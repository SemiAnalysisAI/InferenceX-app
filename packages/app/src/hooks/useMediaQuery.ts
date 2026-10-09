import { useCallback, useSyncExternalStore } from 'react';

const NOOP = () => {};

/** Phones and small tablets in portrait: below Tailwind's `md` breakpoint. */
export const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';

/** Devices whose primary pointer cannot hover (phones, most tablets). */
export const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Subscribe to a CSS media query. Returns `false` during SSR and hydration so
 * server markup and the first client paint agree; the real value lands right
 * after hydration and updates on viewport or input-mode changes.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!canMatch()) return NOOP;
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', onStoreChange);
      return () => mediaQuery.removeEventListener('change', onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => canMatch() && window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useIsMobileViewport(): boolean {
  return useMediaQuery(MOBILE_VIEWPORT_QUERY);
}

export function useIsCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}
