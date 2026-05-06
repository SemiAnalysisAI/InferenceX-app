'use client';

import { MessageSquareText } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { BottomToast } from '@/components/ui/bottom-toast';
import { track } from '@/lib/analytics';

const DISMISS_KEY = 'inferencex-eval-samples-nudge-dismissed';
const OPEN_EVENT = 'inferencex:eval-samples-opened';
const SHOW_DELAY_MS = 1500;
/** Re-show the nudge after a week so returning users see it again. Mirrors the GitHub-star modal's cadence. */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow(): boolean {
  try {
    const value = localStorage.getItem(DISMISS_KEY);
    if (!value) return true;
    const dismissedAt = Number(value);
    if (Number.isNaN(dismissedAt)) return true;
    return Date.now() - dismissedAt >= DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — fail silently.
  }
}

/**
 * Periodic nudge that points users at the per-sample drawer on the evaluation
 * tab. localStorage stores a dismissal timestamp; the nudge re-shows after one
 * week so returning users notice the feature again. The drawer-opens event
 * also marks the nudge dismissed (if the user finds the affordance on their own).
 */
export function EvalSamplesNudge() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;

    const timer = window.setTimeout(() => {
      if (!shouldShow()) return;
      markShown();
      setVisible(true);
      track('evaluation_samples_nudge_shown');
    }, SHOW_DELAY_MS);

    const handleOpened = () => {
      window.clearTimeout(timer);
      markShown();
      setVisible(false);
    };
    window.addEventListener(OPEN_EVENT, handleOpened);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(OPEN_EVENT, handleOpened);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    track('evaluation_samples_nudge_dismissed');
  }, []);

  if (!visible) return null;

  return (
    <BottomToast
      testId="eval-samples-nudge"
      icon={<MessageSquareText className="text-brand" />}
      title="See the model's actual answers"
      description="Click Prompts on any row to compare each prompt, the expected answer, and what the model actually responded."
      onDismiss={handleDismiss}
    />
  );
}
