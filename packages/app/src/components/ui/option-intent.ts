'use client';

import { useCallback, useEffect, useRef } from 'react';

import { saveDataRequested, watchPointerIntent } from '@/components/ui/pointer-intent';

type OptionRef = (element: HTMLElement | null) => (() => void) | undefined;

/**
 * Reports intent toward an option of an open menu, at most once per option each time the menu
 * opens. Intent is the mouse heading toward the option, hovering it (ignored with Save-Data on) or
 * keyboard navigation onto it. Opening the menu and the focus it places on open count for nothing.
 */
export function useOptionIntent(open: boolean, onIntent: ((key: string) => void) | undefined) {
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;
  const fired = useRef(new Set<string>());
  const quiet = useRef(false);
  const refs = useRef(new Map<string, OptionRef>());

  useEffect(() => {
    if (!open) fired.current.clear();
  }, [open]);

  const fire = useCallback((key: string) => {
    if (fired.current.has(key)) return;
    fired.current.add(key);
    onIntentRef.current?.(key);
  }, []);

  const optionRef = (key: string): OptionRef => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (element) => (element ? watchPointerIntent(element, () => fire(key)) : undefined);
      refs.current.set(key, ref);
    }
    return ref;
  };

  return {
    /** Props for the element of option `key`. Empty when nothing listens or `enabled` is false. */
    optionProps: (key: string, enabled = true) =>
      onIntent && enabled
        ? {
            ref: optionRef(key),
            onPointerEnter: () => {
              if (!saveDataRequested()) fire(key);
            },
            onFocus: () => {
              if (!quiet.current) fire(key);
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
