'use client';

import { type ComponentPropsWithoutRef, type MouseEvent, useEffect, useRef } from 'react';

import { track } from '@/lib/analytics/analytics';
import type { OverviewSearchKey } from '@/lib/overview/overview-links';

import { useOverviewNavigation } from './overview-navigation';

const PREFETCH_DWELL_MS = 120;

interface OverviewNavAnalytics {
  control: 'comparison' | 'engine' | 'hwrows' | 'models' | 'rows' | 'tier';
  value: string;
}

interface OverviewNavLinkProps extends ComponentPropsWithoutRef<'a'> {
  href: string;
  analytics: OverviewNavAnalytics;
  searchKeys: readonly OverviewSearchKey[];
}

export function OverviewNavLink({
  href,
  analytics,
  searchKeys,
  onBlur,
  onClick,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: OverviewNavLinkProps) {
  const navigation = useOverviewNavigation();
  const resolvedHref = navigation.resolve(href, searchKeys);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPrefetch = () => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  useEffect(() => cancelPrefetch, []);
  const schedulePrefetch = () => {
    cancelPrefetch();
    timerRef.current = setTimeout(() => navigation.prefetch(href, searchKeys), PREFETCH_DWELL_MS);
  };
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
    if (document.activeElement === event.currentTarget) {
      navigation.focusIntent.current = analytics.control;
    }
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
        if (!event.defaultPrevented) schedulePrefetch();
      }}
      onBlur={(event) => {
        onBlur?.(event);
        cancelPrefetch();
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) schedulePrefetch();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        cancelPrefetch();
      }}
    />
  );
}
