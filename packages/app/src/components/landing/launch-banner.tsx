'use client';

import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { track } from '@/lib/analytics';

const DISMISS_KEY = 'inferencex-dsv4-banner-dismissed';
const BANNER_ID = 'dsv4-launch';
const PRESET_ID = 'dsv4-launch';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === BANNER_ID;
  } catch {
    return false;
  }
}

export function LaunchBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isDismissed()) {
      setVisible(true);
      track('launch_banner_shown', { banner_id: BANNER_ID });
    }
  }, []);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      localStorage.setItem(DISMISS_KEY, BANNER_ID);
    } catch {
      // localStorage unavailable
    }
    setVisible(false);
    track('launch_banner_dismissed', { banner_id: BANNER_ID });
  }, []);

  if (!visible) return null;

  const href = `/inference?preset=${PRESET_ID}`;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    track('launch_banner_clicked', { banner_id: BANNER_ID, preset_id: PRESET_ID });
    // Hard navigation so the `?preset=` param is guaranteed to be in the URL
    // when InferenceContext first mounts and reads window.location.search.
    window.location.href = href;
  };

  return (
    <section className="relative">
      <a
        href={href}
        onClick={handleClick}
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3 transition-all duration-200 hover:border-brand/70 hover:shadow-lg hover:shadow-brand/10"
        data-testid="launch-banner"
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Sparkles className="size-4 animate-pulse" />
        </span>
        <div className="relative flex flex-1 flex-col sm:flex-row sm:items-center sm:gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">
              <span className="align-middle">DeepSeek V4 Pro benchmarks are live</span>
              <span className="ml-2 inline-flex items-center gap-1.5 align-middle rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                New
              </span>
            </p>
            <p className="text-xs text-muted-foreground leading-snug truncate">
              First inference numbers across NVIDIA and AMD GPUs, click to explore.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-brand shrink-0 group-hover:translate-x-0.5 transition-transform duration-200">
            Explore
            <ArrowRight className="size-3.5" />
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="relative ml-1 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Dismiss launch banner"
          data-testid="launch-banner-dismiss"
        >
          <X className="size-4" />
        </button>
      </a>
    </section>
  );
}
