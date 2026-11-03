'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, Suspense, useState } from 'react';

import { type CalculatorUrlSeed, calculatorUrlSeed } from '@/components/calculator/url-seed';
import type { Model } from '@/lib/catalog/data-mappings';

interface CalculatorUrlSeedBoundaryProps {
  routeModel?: Model;
  children: (seed: CalculatorUrlSeed) => ReactNode;
}

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
  const search = useSearchParams();
  const [seed] = useState(() => calculatorUrlSeed(pathname, search.toString(), routeModel));
  return children(seed);
}
