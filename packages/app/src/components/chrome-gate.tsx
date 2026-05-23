'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Hides children on `/embed/*` routes so charts render clean for iframe
 * embedding. All other routes render children unchanged.
 *
 * Wrap any element that must not appear inside partner iframes with this
 * component. PostHog is intentionally excluded — `embed_view` events still
 * need to fire inside the embed.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/embed')) return null;
  return <>{children}</>;
}
