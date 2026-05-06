'use client';

import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { track } from '@/lib/analytics';
import { isDsv4ModalDismissed, saveDsv4ModalDismissed } from '@/lib/dsv4-launch-storage';
import { Button } from '@/components/ui/button';

const PRESET_HREF = '/inference?preset=dsv4-launch';

let sessionDismissed = false;

export function shouldShowDsv4Modal(): boolean {
  if (sessionDismissed) return false;
  return !isDsv4ModalDismissed();
}

export function Dsv4LaunchModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowDsv4Modal()) {
      setOpen(true);
      track('dsv4_modal_shown');
    }
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    sessionDismissed = true;
    saveDsv4ModalDismissed();
  }, []);

  const handleDismiss = useCallback(() => {
    dismiss();
    track('dsv4_modal_dismissed');
  }, [dismiss]);

  const handleExplore = useCallback(() => {
    track('dsv4_modal_explored');
    dismiss();
    // Hard navigation so `?preset=` is in the URL when InferenceContext mounts.
    window.location.href = PRESET_HREF;
  }, [dismiss]);

  if (!open) return null;

  return (
    <aside
      data-testid="dsv4-launch-modal"
      role="dialog"
      aria-modal="false"
      aria-labelledby="dsv4-launch-title"
      aria-describedby="dsv4-launch-description"
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-lg border border-brand/40 bg-background p-6 shadow-lg"
    >
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5 pr-6">
          <h2 id="dsv4-launch-title" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-brand" />
            DeepSeek V4 Pro is live
            <span className="ml-1 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
              New
            </span>
          </h2>
          <p id="dsv4-launch-description" className="text-sm text-muted-foreground">
            Day-zero benchmarks for DeepSeek V4 Pro are now available across the latest NVIDIA and
            AMD GPUs. Results are experimental — see how the new model performs across hardware.
          </p>
        </div>
        <div className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={handleDismiss} data-testid="dsv4-launch-modal-dismiss">
            Maybe Later
          </Button>
          <Button onClick={handleExplore} data-testid="dsv4-launch-modal-explore">
            Explore
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
