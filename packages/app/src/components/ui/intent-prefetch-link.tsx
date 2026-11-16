'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';

import { saveDataRequested, watchPointerIntent } from '@/components/ui/pointer-intent';
import { prefetchRouteData } from '@/lib/prefetch/route-data';

/**
 * `<Link>` that prefetches once the user shows intent (mouse heading toward it, hover, focus or
 * touch) instead of when it scrolls into view. Site-wide nav links point at dynamic dashboards, so
 * viewport prefetch would download their JS and RSC payloads on every page view. Intent also warms
 * the React Query data the target page loads on mount. `prefetch={false}` disables both. With
 * Save-Data on, neither prediction nor hover counts as intent.
 */
export function IntentPrefetchLink({
  prefetch,
  ref: forwardedRef,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  const [element, setElement] = useState<HTMLAnchorElement | null>(null);
  // Wrappers such as Radix `asChild` triggers pass their own ref, which must still reach the anchor.
  const ref = useCallback(
    (node: HTMLAnchorElement | null) => {
      setElement(node);
      if (typeof forwardedRef === 'function') return forwardedRef(node);
      if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  const queryClient = useQueryClient();
  const enabled = prefetch !== false;
  const href = typeof props.href === 'string' ? props.href : null;
  const watch = enabled && !intent;
  useEffect(() => {
    if (!watch || !element) return;
    return watchPointerIntent(element, () => setIntent(true));
  }, [watch, element]);
  useEffect(() => {
    if (intent && enabled && href) prefetchRouteData(queryClient, href);
  }, [intent, enabled, href, queryClient]);
  return (
    <Link
      {...props}
      ref={ref}
      prefetch={prefetch !== false && intent ? (prefetch ?? null) : false}
      onMouseEnter={(event) => {
        if (!saveDataRequested()) setIntent(true);
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
