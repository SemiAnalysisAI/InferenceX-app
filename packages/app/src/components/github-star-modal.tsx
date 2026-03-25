'use client';

import { track } from '@/lib/analytics';
import { Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const STORAGE_KEY = 'inferencex-star-modal-dismissed';
export const STARRED_KEY = 'inferencex-starred';
export const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
export const STARRED_EVENT = 'inferencex:starred';

let sessionDismissed = false;

export function shouldShowModal(): boolean {
  if (sessionDismissed) return false;
  try {
    if (localStorage.getItem(STARRED_KEY)) return false;
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return true;
    const dismissedAt = Number(value);
    if (Number.isNaN(dismissedAt)) return true;
    return Date.now() - dismissedAt >= DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

export function saveDismissTimestamp(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable
  }
}

export function saveStarred(): void {
  try {
    localStorage.setItem(STARRED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
  window.dispatchEvent(new Event(STARRED_EVENT));
}

export function GitHubStarModal() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (shouldShowModal()) {
      setOpen(true);
      track('github_star_modal_shown');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const handleStarred = () => {
      setOpen(false);
      sessionDismissed = true;
    };
    window.addEventListener(STARRED_EVENT, handleStarred);
    return () => window.removeEventListener(STARRED_EVENT, handleStarred);
  }, []);

  const handleDismiss = useCallback(() => {
    setOpen(false);
    sessionDismissed = true;
    saveDismissTimestamp();
    track('github_star_modal_dismissed');
  }, []);

  const handleStar = useCallback(() => {
    window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
    setOpen(false);
    sessionDismissed = true;
    saveStarred();
    track('github_star_modal_starred');
  }, []);

  return (
    <>
      {ready && <span data-testid="star-modal-ready" hidden aria-hidden="true" />}
      <Dialog open={open} onOpenChange={(value) => !value && handleDismiss()}>
        <DialogContent data-testid="github-star-modal" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              Star InferenceX on GitHub
            </DialogTitle>
            <DialogDescription>
              Star InferenceX on GitHub to get notified when we publish new benchmark data. We
              update GPU performance comparisons regularly — starring is the easiest way to stay in
              the loop and help the project grow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleDismiss}
              data-testid="github-star-modal-dismiss"
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleStar}
              data-testid="github-star-modal-star"
              className="star-button-glow"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Star on GitHub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
