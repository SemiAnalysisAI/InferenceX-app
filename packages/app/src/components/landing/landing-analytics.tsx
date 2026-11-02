'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';
import { navigateInApp } from '@/lib/routing/client-navigation';

export function LandingPageAnalytics() {
  useEffect(() => {
    trackOncePerPageview('landing_page_viewed');
  }, []);

  return null;
}

interface LandingTrackedLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  href: string;
  analyticsEvent: string;
  appNavigation?: boolean;
}

export function LandingTrackedLink({
  href,
  analyticsEvent,
  appNavigation = false,
  onClick,
  ...props
}: LandingTrackedLinkProps) {
  const router = useRouter();

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track(analyticsEvent, { placement: placementFor(event.currentTarget) });
        if (appNavigation) navigateInApp(event, router, href);
      }}
    />
  );
}
