'use client';

import { useEffect, useRef } from 'react';

import { track } from './analytics';

export const SEARCH_TRACK_DELAY_MS = 1000;

/**
 * Tracks `eventName` with `query_length` once typing pauses for `SEARCH_TRACK_DELAY_MS`. Empty
 * queries and a repeat of the last tracked query are skipped until the box is cleared. The typed
 * text is never sent. `properties` (for example a result count) are read when the event fires.
 */
export function useSearchTracking(
  eventName: string,
  query: string,
  properties?: Record<string, unknown>,
): void {
  const latestProperties = useRef(properties);
  const lastTracked = useRef('');
  useEffect(() => {
    latestProperties.current = properties;
  });
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      lastTracked.current = '';
      return;
    }
    if (trimmed === lastTracked.current) return;
    const timer = setTimeout(() => {
      lastTracked.current = trimmed;
      track(eventName, { ...latestProperties.current, query_length: trimmed.length });
    }, SEARCH_TRACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eventName, query]);
}
