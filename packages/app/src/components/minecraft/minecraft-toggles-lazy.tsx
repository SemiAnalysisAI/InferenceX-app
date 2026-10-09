'use client';

import { lazy, Suspense } from 'react';
import { useEasterEggTheme } from '@/lib/use-easter-egg-theme';

const Toggles = lazy(() =>
  import('./minecraft-toggles').then((module) => ({
    default: module.MinecraftToggles,
  })),
);

export function MinecraftTogglesLazy() {
  const theme = useEasterEggTheme();
  return theme === 'minecraft' ? (
    <Suspense fallback={null}>
      <Toggles />
    </Suspense>
  ) : null;
}
