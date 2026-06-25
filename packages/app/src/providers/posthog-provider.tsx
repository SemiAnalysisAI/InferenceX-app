'use client';

import type { PostHog } from 'posthog-js';
import { Suspense, createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { registerAnalyticsClient } from '@/lib/analytics';
import { installChunkLoadRecovery } from '@/lib/chunk-load-recovery';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const PostHogCtx = createContext<PostHog | null>(null);
const disabledAnalyticsClient = { capture: () => undefined };

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    installChunkLoadRecovery();
    if (!POSTHOG_KEY || process.env.NODE_ENV !== 'production') {
      registerAnalyticsClient(disabledAnalyticsClient);
      return;
    }

    let disposed = false;
    let idleId: number | undefined;
    let fallbackId: ReturnType<typeof setTimeout> | undefined;

    const initialize = () => {
      import('posthog-js')
        .then(({ default: posthog }) => {
          if (disposed) return;
          posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: 'identified_only',
            capture_pageview: false,
            capture_pageleave: true,
            autocapture: true,
            capture_dead_clicks: true,
            capture_performance: { network_timing: true, web_vitals: true },
          });
          registerAnalyticsClient(posthog);
          setClient(posthog);
        })
        .catch(() => {
          if (!disposed) registerAnalyticsClient(disabledAnalyticsClient);
        });
    };

    const scheduleInitialization = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(initialize, { timeout: 5_000 });
      } else {
        fallbackId = globalThis.setTimeout(initialize, 1_000);
      }
    };

    if (document.readyState === 'complete') {
      scheduleInitialization();
    } else {
      window.addEventListener('load', scheduleInitialization, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener('load', scheduleInitialization);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (fallbackId !== undefined) window.clearTimeout(fallbackId);
    };
  }, []);

  return <PostHogCtx.Provider value={client}>{children}</PostHogCtx.Provider>;
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = useContext(PostHogCtx);

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname;
      if (searchParams.toString()) url += `?${searchParams.toString()}`;
      ph.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

/** Track SPA page views on route change (wrapped in Suspense for useSearchParams) */
export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
