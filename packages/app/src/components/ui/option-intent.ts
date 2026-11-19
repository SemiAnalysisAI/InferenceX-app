'use client';

import { useCallback, useEffect, useRef } from 'react';

import { saveDataRequested } from '@/components/ui/pointer-intent';

/** Menus pack options tightly, so a pointer passing over one is not intent until it rests there. */
export const OPTION_HOVER_DWELL_MS = 150;
const KEYBOARD_FOCUS_WINDOW_MS = 500;

/**
 * Reports intent toward an option of an open menu, at most once per option each time the menu
 * opens. Intent is the pointer resting on the option (ignored with Save-Data on) or keyboard
 * navigation onto it. Opening the menu, the focus it places on open and focus that merely follows
 * the pointer count for nothing.
 */
export function useOptionIntent(open: boolean, onIntent: ((key: string) => void) | undefined) {
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;
  const fired = useRef(new Set<string>());
  const quiet = useRef(false);
  const dwell = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const lastKeyAt = useRef(-Infinity);

  const cancelDwell = useCallback(() => {
    if (dwell.current) clearTimeout(dwell.current.timer);
    dwell.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      fired.current.clear();
      cancelDwell();
      return;
    }
    const onKeyDown = () => {
      lastKeyAt.current = performance.now();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      cancelDwell();
    };
  }, [open, cancelDwell]);

  const fire = useCallback((key: string) => {
    if (fired.current.has(key)) return;
    fired.current.add(key);
    onIntentRef.current?.(key);
  }, []);

  return {
    /** Props for the element of option `key`. Empty when nothing listens or `enabled` is false. */
    optionProps: (key: string, enabled = true) =>
      onIntent && enabled
        ? {
            onPointerEnter: () => {
              cancelDwell();
              if (saveDataRequested() || fired.current.has(key)) return;
              dwell.current = { key, timer: setTimeout(() => fire(key), OPTION_HOVER_DWELL_MS) };
            },
            onPointerLeave: () => {
              if (dwell.current?.key === key) cancelDwell();
            },
            onFocus: () => {
              if (quiet.current) return;
              if (performance.now() - lastKeyAt.current < KEYBOARD_FOCUS_WINDOW_MS) fire(key);
            },
          }
        : {},
    /** Focuses `element` without counting the focus as intent. */
    focusQuietly: (element: HTMLElement | null | undefined) => {
      quiet.current = true;
      try {
        element?.focus();
      } finally {
        quiet.current = false;
      }
    },
  };
}
