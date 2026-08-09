'use client';

import { type ComponentPropsWithoutRef, type MouseEvent, useEffect, useRef } from 'react';

import { track } from '@/lib/analytics';
import type { OverviewSearchKey } from '@/lib/overview-links';

import { useOverviewNavigation } from './overview-navigation';

/** Long enough to skip options a pointer only passes over, short enough that a
 *  deliberate hover still warms the response before the click lands. */
const PREFETCH_DWELL_MS = 120;

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
  onBlur,
  onClick,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: OverviewNavLinkProps) {
  const navigation = useOverviewNavigation();
  const resolvedHref = navigation.resolve(href, searchKeys);

  // A pointer sweeping across the option strip used to fire one request per
  // option it crossed. Warm only what the pointer settles on. The unmount
  // cleanup is load-bearing, not defensive: the activated option swaps to a
  // <span>, so a pending timer routinely outlives its own element.
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
    // This anchor is about to be replaced by the active <span>, which destroys
    // the focused node. Record where focus was so its replacement can take it.
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
