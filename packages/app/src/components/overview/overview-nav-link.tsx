'use client';

import { type ComponentPropsWithoutRef, type MouseEvent } from 'react';

import { track } from '@/lib/analytics';
import type { OverviewSearchKey } from '@/lib/overview-links';

import { useOverviewNavigation } from './overview-navigation';

interface OverviewNavAnalytics {
  control: 'comparison' | 'engine' | 'models' | 'tier';
  value: string;
}

interface OverviewNavLinkProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
  analytics: OverviewNavAnalytics;
  searchKeys: readonly OverviewSearchKey[];
}

/**
 * Keeps overview controls as real links while upgrading ordinary clicks to an
 * App Router transition. Modified clicks, copied URLs and no-JS navigation keep
 * the anchor's native behavior.
 */
export function OverviewNavLink({
  href,
  analytics,
  searchKeys,
  onClick,
  onFocus,
  onPointerEnter,
  ...props
}: OverviewNavLinkProps) {
  const navigation = useOverviewNavigation();
  const resolvedHref = navigation.resolve(href, searchKeys);

  const prefetch = () => navigation.prefetch(href, searchKeys);
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
    navigation.push(href, searchKeys);
  };

  return (
    <a
      {...props}
      href={resolvedHref}
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
