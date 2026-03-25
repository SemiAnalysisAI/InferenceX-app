'use client';

import { track } from '@/lib/analytics';
import { Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { STARRED_EVENT } from '@/lib/star-storage';
import { BottomToast } from '@/components/ui/bottom-toast';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export const NUDGE_SESSION_KEY = 'inferencex-star-nudge-shown';
const TAB_CHANGE_THRESHOLD = 2;

export function shouldShowNudge(): boolean {
  try {
    const modalDismissed = sessionStorage.getItem(NUDGE_SESSION_KEY);
    if (modalDismissed) return false;
    return true;
  } catch {
    return false;
  }
}

export function saveNudgeShown(): void {
  try {
    sessionStorage.setItem(NUDGE_SESSION_KEY, '1');
  } catch {
    // sessionStorage unavailable
  }
}

export function StarNudge() {
  const [visible, setVisible] = useState(false);
  const tabChangeCount = useRef(0);
  const hasShown = useRef(false);

  const showNudge = useCallback(() => {
    if (hasShown.current) return;
    if (!shouldShowNudge()) return;
    hasShown.current = true;
    saveNudgeShown();
    setVisible(true);
    track('star_nudge_shown');
  }, []);

  useEffect(() => {
    const handleTabChange = () => {
      if (hasShown.current) return;
      tabChangeCount.current += 1;
      if (tabChangeCount.current >= TAB_CHANGE_THRESHOLD) {
        showNudge();
      }
    };

    const handleAction = () => {
      if (hasShown.current) return;
      setTimeout(() => showNudge(), 1500);
    };

    const handleStarred = () => setVisible(false);

    window.addEventListener('inferencex:tab-change', handleTabChange);
    window.addEventListener('inferencex:action', handleAction);
    window.addEventListener(STARRED_EVENT, handleStarred);
    return () => {
      window.removeEventListener('inferencex:tab-change', handleTabChange);
      window.removeEventListener('inferencex:action', handleAction);
      window.removeEventListener(STARRED_EVENT, handleStarred);
    };
  }, [showNudge]);

  const handleStar = useCallback(() => {
    window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
    track('star_nudge_starred');
  }, []);

  if (!visible) return null;

  return (
    <BottomToast
      testId="star-nudge"
      icon={<Star className="text-yellow-500 fill-yellow-500" />}
      title="Finding us useful?"
      description="Help the project grow so we can add more benchmarks! Star us on GitHub."
      action={{
        label: 'Star on GitHub',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        ),
        onClick: handleStar,
      }}
      onDismiss={() => track('star_nudge_dismissed')}
    />
  );
}
