'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

/**
 * `<Link>` that prefetches once the user shows intent (hover, focus or touch) instead of when it
 * scrolls into view. Site-wide nav links point at dynamic dashboards, so viewport prefetch would
 * download their JS and RSC payloads on every page view. `prefetch={false}` still disables it.
 */
export function IntentPrefetchLink({
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={prefetch !== false && intent ? (prefetch ?? null) : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
