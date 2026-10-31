'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  hasPendingAnalyticsEvents,
  registerAnalyticsClient,
  trackPageview,
  trackVirtualPageview,
} from '@/lib/analytics/analytics';
import { markNavigationStart } from '@/lib/analytics/navigation-timing';
import { maskCapturedNetworkRequest } from '@/lib/analytics/network-request-mask';
import { installOutboundLinkTracking } from '@/lib/analytics/outbound-links';
import {
  assignedLandingBannerVariant,
  LANDING_BANNER_VARIANT_PROPERTY,
} from '@/lib/nudges/landing-banner';
import {
  CLIENT_PATHNAME_CHANGE_EVENT,
  isPageviewPathnameChange,
} from '@/lib/routing/client-navigation';
import { installChunkLoadRecovery } from '@/lib/runtime/chunk-load-recovery';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// First-party reverse proxy (rewrites in next.config.ts) so blocklists that match *.posthog.com do not drop events.
const POSTHOG_API_HOST = '/ingest';
const POSTHOG_UI_HOST = 'https://us.posthog.com';

const disabledAnalyticsClient = { capture: () => undefined };

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installChunkLoadRecovery();
    if (!POSTHOG_KEY || process.env.NODE_ENV !== 'production') {
      registerAnalyticsClient(disabledAnalyticsClient);
      return;
    }

    const uninstallOutboundLinkTracking = installOutboundLinkTracking();
    let disposed = false;
    let idleId: number | undefined;
    let fallbackId: ReturnType<typeof setTimeout> | undefined;
    let started = false;

    const initialize = () => {
      if (started) return;
      started = true;
      removeHiddenListeners();
      import('posthog-js')
        .then(({ default: posthog }) => {
          if (disposed) return;
          posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_API_HOST,
            ui_host: POSTHOG_UI_HOST,
            person_profiles: 'identified_only',
            capture_pageview: false,
            capture_pageleave: true,
            autocapture: true,
            capture_dead_clicks: false,
            capture_performance: { network_timing: true, web_vitals: true },
            disable_surveys: true,
            session_recording: { maskCapturedNetworkRequestFn: maskCapturedNetworkRequest },
          });
          // Before replaying queued events, so they carry the arm too.
          const landingBannerVariant = assignedLandingBannerVariant();
          if (landingBannerVariant) {
            posthog.register({ [LANDING_BANNER_VARIANT_PROPERTY]: landingBannerVariant });
          }
          registerAnalyticsClient(posthog);
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

    // A visitor who leaves before the idle callback would lose the queued pageview; start loading now so
    // it can still send (tab switches keep the page alive; bfcache restores resume the load).
    const initializeIfQueued = () => {
      if (hasPendingAnalyticsEvents()) initialize();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') initializeIfQueued();
    };
    function removeHiddenListeners() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', initializeIfQueued);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', initializeIfQueued);

    if (document.readyState === 'complete') {
      scheduleInitialization();
    } else {
      window.addEventListener('load', scheduleInitialization, { once: true });
    }

    return () => {
      disposed = true;
      uninstallOutboundLinkTracking();
      window.removeEventListener('load', scheduleInitialization);
      removeHiddenListeners();
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (fallbackId !== undefined) window.clearTimeout(fallbackId);
    };
  }, []);

  return children;
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    markNavigationStart(window.location.pathname);
    trackPageview();
  }, [pathname, searchParams]);

  useEffect(() => {
    // Model switches rewrite the path without the Next router, so usePathname() never changes.
    const onClientPathnameChange = (event: Event) => {
      markNavigationStart(window.location.pathname);
      if (isPageviewPathnameChange(event))
        trackVirtualPageview(window.location.href, 'client_pathname_change');
    };
    window.addEventListener(CLIENT_PATHNAME_CHANGE_EVENT, onClientPathnameChange);
    return () => window.removeEventListener(CLIENT_PATHNAME_CHANGE_EVENT, onClientPathnameChange);
  }, []);

  return null;
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
