'use client';

import { usePathname } from 'next/navigation';
import { Fragment, type ReactNode, useState, useSyncExternalStore } from 'react';

import { type CalculatorUrlSeed, calculatorUrlSeed } from '@/components/calculator/url-seed';
import type { Model } from '@/lib/catalog/data-mappings';

interface CalculatorUrlSeedBoundaryProps {
  routeModel?: Model;
  children: (seed: CalculatorUrlSeed) => ReactNode;
}

const subscribeNoop = () => () => {};

export function CalculatorUrlSeedBoundary({
  routeModel,
  children,
}: CalculatorUrlSeedBoundaryProps) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const [seeds] = useState(() => {
    const path = calculatorUrlSeed(pathname, '', routeModel);
    const url =
      typeof window === 'undefined'
        ? path
        : calculatorUrlSeed(pathname, window.location.search, routeModel);
    return { path, url };
  });
  const seed = hydrated ? seeds.url : seeds.path;
  return <Fragment key={JSON.stringify(seed)}>{children(seed)}</Fragment>;
}
