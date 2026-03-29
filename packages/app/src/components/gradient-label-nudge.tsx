'use client';

import { track } from '@/lib/analytics';
import { Palette } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomToast } from '@/components/ui/bottom-toast';

export const GRADIENT_NUDGE_EVENT = 'inferencex:parallelism-label-enabled';
export const SESSION_KEY = 'inferencex-gradient-nudge-shown';

export function shouldShowGradientNudge(): boolean {
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

export function saveGradientNudgeShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

export function GradientLabelNudge() {
  const [visible, setVisible] = useState(false);
  const hasShown = useRef(false);
  const enableGradientRef = useRef<(() => void) | null>(null);

  const showNudge = useCallback(() => {
    if (hasShown.current) return;
    if (!shouldShowGradientNudge()) return;
    hasShown.current = true;
    saveGradientNudgeShown();
    setVisible(true);
    track('gradient_nudge_shown');
  }, []);

  useEffect(() => {
    const handleEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.enableGradient) {
        enableGradientRef.current = detail.enableGradient;
      }
      showNudge();
    };

    window.addEventListener(GRADIENT_NUDGE_EVENT, handleEvent);
    return () => window.removeEventListener(GRADIENT_NUDGE_EVENT, handleEvent);
  }, [showNudge]);

  const handleTryGradient = useCallback(() => {
    enableGradientRef.current?.();
    track('gradient_nudge_accepted');
  }, []);

  if (!visible) return null;

  return (
    <BottomToast
      testId="gradient-label-nudge"
      icon={<Palette className="text-purple-500" />}
      title="Try Gradient Labels"
      description="Gradient labels color-code data points by parallelism level, making it easier to spot performance patterns at a glance."
      action={{
        label: 'Enable Gradient Labels',
        onClick: handleTryGradient,
      }}
      onDismiss={() => track('gradient_nudge_dismissed')}
    />
  );
}
