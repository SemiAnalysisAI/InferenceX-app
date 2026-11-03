'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useState } from 'react';

import { type CalculatorUrlSeed, calculatorUrlSeed } from '@/components/calculator/url-seed';
import type { Model } from '@/lib/catalog/data-mappings';

interface CalculatorUrlSeedBoundaryProps {
  /** The model the route selects without a query: its path slug or the tab default. */
  routeModel?: Model;
  children: (seed: CalculatorUrlSeed) => ReactNode;
}

/**
 * Calculator pages are static, so the server cannot read the query. The prerendered HTML is the
 * route's path-only state (profit filter segments included), and the client renders the tool
 * from the full URL instead of hydrating that HTML, so a deep link never mounts (or fetches) the
 * path-only state before switching.
 */
export function CalculatorUrlSeedBoundary({
  routeModel,
  children,
}: CalculatorUrlSeedBoundaryProps) {
  return (
    <Suspense fallback={<PathSeeded routeModel={routeModel}>{children}</PathSeeded>}>
      <UrlSeeded routeModel={routeModel}>{children}</UrlSeeded>
    </Suspense>
  );
}

function PathSeeded({ routeModel, children }: CalculatorUrlSeedBoundaryProps) {
  return children(calculatorUrlSeed(usePathname(), '', routeModel));
}

function UrlSeeded({ routeModel, children }: CalculatorUrlSeedBoundaryProps) {
  const pathname = usePathname();
  // Reading the query keeps this subtree out of the prerender (client-side rendering bailout).
  const search = useSearchParams();
  // Fixed per mount like the server seed it replaces: in-place URL rewrites must not reseed.
  const [seed] = useState(() => calculatorUrlSeed(pathname, search.toString(), routeModel));
  return children(seed);
}
