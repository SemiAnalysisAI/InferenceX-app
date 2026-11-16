'use client';

import { useSyncExternalStore } from 'react';

import { MOBILE_VIEWPORT_QUERY } from '@/hooks/useMediaQuery';

const NOOP = () => {};
const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function subscribe(onChange: () => void) {
  if (!canMatch()) return NOOP;
  const query = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the viewport is a phone's right now; false where it cannot be measured. */
export const phoneViewport = () => canMatch() && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;

/**
 * `useIsMobileViewport` with the server's guess in place of false. The clip stage's opening pair
 * depends on it, and the server renders that pair's first frames: with the guess, a phone's
 * document already shows the pair it will keep, so hydration swaps no picture.
 */
export function usePhone(serverGuess = false): boolean {
  return useSyncExternalStore(subscribe, phoneViewport, () => serverGuess);
}
