'use client';

import { useRouter } from 'next/navigation';
import { startTransition, type ComponentPropsWithoutRef, type MouseEvent } from 'react';

import { track } from '@/lib/analytics';
import { notifyClientSearchChange } from '@/lib/client-navigation';

interface OverviewNavAnalytics {
  control: 'comparison' | 'engine' | 'tier';
  value: string;
}

interface OverviewNavLinkProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
  analytics: OverviewNavAnalytics;
}

/**
 * Keeps overview controls as real links while upgrading ordinary clicks to an
 * App Router transition. Modified clicks, copied URLs and no-JS navigation keep
 * the anchor's native behavior.
 */
export function OverviewNavLink({
  href,
  analytics,
  onClick,
  onFocus,
  onPointerEnter,
  ...props
}: OverviewNavLinkProps) {
  const router = useRouter();

  const prefetch = () => router.prefetch(href);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.currentTarget.target
    ) {
      return;
    }

    event.preventDefault();
    track('overview_selector_changed', {
      control: analytics.control,
      value: analytics.value,
    });
    notifyClientSearchChange(href);
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <a
      {...props}
      href={href}
      onClick={handleClick}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) prefetch();
      }}
    />
  );
}
