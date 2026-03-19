'use client';

import type { PostHog } from 'posthog-js';
import { Suspense, createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const PostHogCtx = createContext<PostHog | null>(null);

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    if (!POSTHOG_KEY || window.location.hostname === 'localhost') return;
    import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          person_profiles: 'identified_only',
          capture_pageview: false,
          capture_pageleave: true,
          autocapture: true,
          capture_dead_clicks: true,
          capture_performance: { network_timing: true, web_vitals: true },
        });
        setClient(posthog);
      })
      .catch(() => {});
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
      if (searchParams.toString()) url += '?' + searchParams.toString();
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
