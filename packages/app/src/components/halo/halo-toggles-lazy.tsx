'use client';

import { lazy, Suspense } from 'react';
import { useEasterEggTheme } from '@/lib/themes/use-easter-egg-theme';

const Toggles = lazy(() =>
  import('./halo-toggles').then((module) => ({
    default: module.HaloToggles,
  })),
);

export function HaloTogglesLazy() {
  const theme = useEasterEggTheme();
  return theme === 'halo' ? (
    <Suspense fallback={null}>
      <Toggles />
    </Suspense>
  ) : null;
}
