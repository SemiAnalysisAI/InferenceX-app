'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { track } from '@/lib/analytics';
import { navigateInApp } from '@/lib/client-navigation';

export function LandingPageAnalytics() {
  useEffect(() => {
    track('landing_page_viewed');
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
        track(analyticsEvent);
        if (appNavigation) navigateInApp(event, router, href);
      }}
    />
  );
}
