'use client';

import { useEffect } from 'react';

import {
  FEEDBACK_ELIGIBLE_EVENT,
  FEEDBACK_TARGET_VISIT,
  recordVisitIfNew,
} from '@/lib/visit-tracking';

export function VisitTracker() {
  useEffect(() => {
    const count = recordVisitIfNew();
    if (count !== FEEDBACK_TARGET_VISIT) return undefined;
    // setTimeout(0) so the engine's listener (deeper in the tree) is attached first.
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event(FEEDBACK_ELIGIBLE_EVENT));
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
