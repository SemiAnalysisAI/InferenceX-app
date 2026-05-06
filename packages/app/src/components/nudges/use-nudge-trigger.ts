'use client';

import { useEffect, useRef, useState } from 'react';

import type { NudgeTrigger } from '@/lib/nudges';

interface UseNudgeTriggerOptions {
  trigger: NudgeTrigger;
  /** Whether the nudge is currently allowed to fire (route + persistence + condition + schedule). */
  enabled: boolean;
  /**
   * Once a nudge has been queued, ignore further trigger fires (we don't want a
   * single nudge to be re-queued mid-display by a chatty event).
   */
  alreadyShown: boolean;
}

interface TriggerState {
  /** True once the trigger condition has been satisfied. */
  fired: boolean;
  /** Detail object from the firing CustomEvent, if any. */
  detail: unknown;
}

/**
 * Wires a NudgeTrigger up to React state. Returns `{ fired, detail }` — once
 * `fired` flips true, the parent component renders the nudge.
 */
export function useNudgeTrigger({
  trigger,
  enabled,
  alreadyShown,
}: UseNudgeTriggerOptions): TriggerState {
  const [state, setState] = useState<TriggerState>({ fired: false, detail: undefined });
  const eventCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled || alreadyShown || state.fired) return;

    if (trigger.kind === 'mount') {
      setState({ fired: true, detail: undefined });
      return;
    }

    if (trigger.kind === 'mount-delay') {
      const id = window.setTimeout(() => {
        setState({ fired: true, detail: undefined });
      }, trigger.delayMs);
      return () => window.clearTimeout(id);
    }

    // Event trigger — listen for one or more named CustomEvents. Each event
    // can have its own threshold (default 1). The trigger fires the first
    // time *any* tracked event meets its threshold.
    const counts = eventCounts.current;
    const cleanups: (() => void)[] = [];
    let pendingTimer: number | null = null;

    const fireAfterDelay = (detail: unknown) => {
      const delayMs = trigger.afterDelayMs ?? 0;
      if (delayMs <= 0) {
        setState({ fired: true, detail });
        return;
      }
      if (pendingTimer !== null) return;
      pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        setState({ fired: true, detail });
      }, delayMs);
    };

    for (const evt of trigger.events) {
      const threshold = evt.threshold ?? 1;
      const target: EventTarget = evt.target === 'document' ? document : window;
      const handler = (e: Event) => {
        if (evt.selector) {
          const t = e.target as Element | null;
          if (!t || !t.closest || !t.closest(evt.selector)) return;
        }
        const next = (counts.get(evt.name) ?? 0) + 1;
        counts.set(evt.name, next);
        if (next >= threshold) {
          const detail = e instanceof CustomEvent ? e.detail : undefined;
          fireAfterDelay(detail);
        }
      };
      target.addEventListener(evt.name, handler);
      cleanups.push(() => target.removeEventListener(evt.name, handler));
    }

    return () => {
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      for (const cleanup of cleanups) cleanup();
    };
  }, [trigger, enabled, alreadyShown, state.fired]);

  return state;
}
