'use client';

import { useEffect, useRef } from 'react';

import { track } from './analytics';

/**
 * Tracks `eventName` with `duration_ms` whenever `open` goes from true to false, however the dialog
 * closed (close button, Escape, overlay click, or a programmatic close). Use it next to the state that
 * drives a dialog, drawer, or popover whose opening is already tracked. A dialog that starts closed
 * sends nothing.
 */
export function useDialogCloseTracking(
  open: boolean,
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  const openedAt = useRef<number | null>(null);
  const latestProperties = useRef(properties);
  useEffect(() => {
    latestProperties.current = properties;
  });
  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      return;
    }
    if (openedAt.current === null) return;
    const durationMs = Date.now() - openedAt.current;
    openedAt.current = null;
    track(eventName, { ...latestProperties.current, duration_ms: durationMs });
  }, [open, eventName]);
}
