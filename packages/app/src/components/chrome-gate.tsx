'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Hides chrome (Header, Footer) on `/embed/*` routes so the chart is rendered
 * standalone for iframe embedding. All other routes render children unchanged.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/embed')) return null;
  return <>{children}</>;
}
