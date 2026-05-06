'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { track } from '@/lib/analytics';
import {
  type NudgeContext,
  type NudgeEntry,
  isDismissed,
  isWithinSchedule,
  markDismissed,
} from '@/lib/nudges';

import { NudgeBanner } from './NudgeBanner';
import { NudgeModal } from './NudgeModal';
import { NudgeToast } from './NudgeToast';
import { useNudgeSlot } from './NudgeProvider';
import { useNudgeTrigger } from './use-nudge-trigger';

interface NudgeProps {
  entry: NudgeEntry;
}

/**
 * Single nudge orchestrator. Handles the full lifecycle:
 *
 *   route match → schedule check → persistence check → condition →
 *   trigger fires → slot request (modal/banner) → render → analytics
 *
 * Toast nudges skip the slot — `BottomToast` already self-coordinates a single
 * visible toast via the `inferencex:dismiss-toast` window event.
 */
export function Nudge({ entry }: NudgeProps) {
  const pathname = usePathname() ?? '';
  const slot = useNudgeSlot();
  const [visible, setVisible] = useState(false);
  const [shownOnce, setShownOnce] = useState(false);

  const routeMatches = useMemo(() => {
    if (!entry.routes || entry.routes.length === 0) return true;
    return entry.routes.some((re) => re.test(pathname));
  }, [entry.routes, pathname]);

  // Re-evaluated on every render so external state changes (e.g. another
  // module called `markDismissed`) are picked up promptly.
  const passesPreconditions =
    routeMatches &&
    isWithinSchedule(entry.schedule) &&
    !isDismissed(entry.id, entry.persistence) &&
    (entry.condition?.() ?? true);

  const persistOn = entry.persistOn ?? (entry.kind === 'toast' ? 'show' : 'dismiss');

  const { fired, detail } = useNudgeTrigger({
    trigger: entry.trigger,
    enabled: passesPreconditions,
    alreadyShown: shownOnce,
  });

  // All kinds go through the slot manager so only one nudge per kind is
  // visible at a time. Priority resolves ties: e.g. dsv4-launch-modal wins
  // over github-star-modal, and eval-samples-nudge wins over reproducibility
  // on /evaluation.
  useEffect(() => {
    if (!fired || shownOnce) return;
    if (!passesPreconditions) return;
    const priority = entry.priority ?? 0;
    const granted = slot.requestSlot(entry.kind, entry.id, priority);
    if (!granted) return;
    setVisible(true);
    setShownOnce(true);
    if (persistOn === 'show') {
      markDismissed(entry.id, entry.persistence);
    }
    track('nudge_shown', { id: entry.id, kind: entry.kind });
  }, [
    fired,
    shownOnce,
    passesPreconditions,
    entry.id,
    entry.kind,
    entry.persistence,
    entry.priority,
    persistOn,
    slot,
  ]);

  // External-dismiss listeners: hide without persisting (the underlying state
  // these events represent is what gates re-show — e.g. starring sets
  // `inferencex-starred` which `condition` checks).
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!entry.externalDismissEvents || entry.externalDismissEvents.length === 0) return;
    const handler = () => {
      if (!visibleRef.current) return;
      setVisible(false);
      slot.releaseSlot(entry.kind, entry.id);
    };
    const events = entry.externalDismissEvents;
    for (const name of events) window.addEventListener(name, handler);
    return () => {
      for (const name of events) window.removeEventListener(name, handler);
    };
  }, [entry.externalDismissEvents, entry.id, entry.kind, slot]);

  // Release the slot if we get force-unmounted (route change while visible).
  useEffect(
    () => () => {
      slot.releaseSlot(entry.kind, entry.id);
    },
    [entry.id, entry.kind, slot],
  );

  const dismiss = useCallback(() => {
    if (!visible) return;
    setVisible(false);
    markDismissed(entry.id, entry.persistence);
    slot.releaseSlot(entry.kind, entry.id);
    track('nudge_dismissed', { id: entry.id, kind: entry.kind });
  }, [visible, entry.id, entry.persistence, entry.kind, slot]);

  const onAction = useCallback(() => {
    setVisible(false);
    markDismissed(entry.id, entry.persistence);
    slot.releaseSlot(entry.kind, entry.id);
    track('nudge_action_clicked', { id: entry.id, kind: entry.kind });
  }, [entry.id, entry.persistence, entry.kind, slot]);

  const ctx = useMemo<NudgeContext>(
    () => ({ id: entry.id, triggerDetail: detail, dismiss }),
    [entry.id, detail, dismiss],
  );

  if (!visible) return null;
  if (!slot.isSlotHolder(entry.kind, entry.id)) return null;

  const content = entry.render(ctx);

  if (entry.kind === 'modal') {
    return <NudgeModal id={entry.id} content={content} ctx={ctx} onAction={onAction} />;
  }
  if (entry.kind === 'banner') {
    return <NudgeBanner id={entry.id} content={content} ctx={ctx} onAction={onAction} />;
  }
  return <NudgeToast id={entry.id} content={content} ctx={ctx} onAction={onAction} />;
}
