'use client';

import { track } from '@/lib/analytics';
import { Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { BottomToast } from '@/components/ui/bottom-toast';

export const SESSION_KEY = 'inferencex-export-nudge-shown';
export const COPY_THRESHOLD = 2;

/** Check if the export nudge should show (fails closed if sessionStorage is unavailable). */
export function shouldShowExportNudge(): boolean {
  try {
    return !sessionStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}

/** Persist that the nudge was shown this session. */
export function saveExportNudgeShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignore — nudge still shows this mount but won't persist
  }
}

export function ExportNudge() {
  const [visible, setVisible] = useState(false);
  const copyCount = useRef(0);
  const hasShown = useRef(false);

  const showNudge = useCallback(() => {
    if (hasShown.current) return;
    if (!shouldShowExportNudge()) return;
    hasShown.current = true;
    saveExportNudgeShown();
    setVisible(true);
    track('export_nudge_shown');
  }, []);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isTooltip = target.closest('[data-chart-tooltip]');
      if (!isTooltip) return;

      copyCount.current += 1;
      if (copyCount.current >= COPY_THRESHOLD) {
        showNudge();
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [showNudge]);

  if (!visible) return null;

  return (
    <BottomToast
      testId="export-nudge"
      icon={<Download className="text-blue-500" />}
      title="Need the data?"
      description="Use the download button on any chart to export as PNG or CSV — no need to copy from tooltips."
      onDismiss={() => track('export_nudge_dismissed')}
    />
  );
}
