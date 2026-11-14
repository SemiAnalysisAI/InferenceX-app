'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

import { watchPointerIntent } from '@/components/ui/pointer-intent';
import { mountPointerIntentDebug } from '@/components/ui/pointer-intent-debug';

mountPointerIntentDebug();

/**
 * `<Link>` that prefetches once the user shows intent (mouse heading toward it, hover, focus or
 * touch) instead of when it scrolls into view. Site-wide nav links point at dynamic dashboards, so
 * viewport prefetch would download their JS and RSC payloads on every page view.
 * `prefetch={false}` still disables it.
 */
export function IntentPrefetchLink({
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const watch = prefetch !== false && !intent;
  useEffect(() => {
    if (!watch || !ref.current) return;
    return watchPointerIntent(ref.current, () => setIntent(true));
  }, [watch]);
  return (
    <Link
      {...props}
      ref={ref}
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
