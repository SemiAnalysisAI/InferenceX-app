'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { BottomToast } from '@/components/ui/bottom-toast';
import { track } from '@/lib/analytics';

const SESSION_KEY = 'inferencex-reproducibility-nudge-shown';
const SHOW_DELAY_MS = 1500;
const ABOUT_URL = '/about#reproducibility';

function shouldShow(): boolean {
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

export function ReproducibilityNudge() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;
    const timer = window.setTimeout(() => {
      markShown();
      setVisible(true);
      track('reproducibility_nudge_shown');
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const handleAction = useCallback(() => {
    track('reproducibility_nudge_see_how_clicked');
    router.push(ABOUT_URL);
  }, [router]);

  if (!visible) return null;

  return (
    <BottomToast
      testId="reproducibility-nudge"
      icon={<ShieldCheck className="text-brand" />}
      title="Every result is reproducible"
      description="Each data point is produced by a public GitHub Actions run. Click any point on a chart to jump to the exact run, logs, and artifacts."
      action={{
        label: 'See how',
        onClick: handleAction,
      }}
      onDismiss={() => track('reproducibility_nudge_dismissed')}
    />
  );
}
