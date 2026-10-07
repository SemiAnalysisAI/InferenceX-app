'use client';

import { lazy, Suspense } from 'react';
import { useEasterEggTheme } from '@/lib/use-easter-egg-theme';

const themes = {
  minecraft: lazy(() => import('./minecraft/minecraft-theme')),
  csgo: lazy(() => import('./csgo/csgo-theme')),
  gta: lazy(() => import('./gta/gta-theme')),
  kart: lazy(() => import('./kart/kart-decorations')),
  halo: lazy(() => import('./halo/halo-theme')),
};

export function EasterEggThemeLazy() {
  const theme = useEasterEggTheme();
  if (!theme) return null;
  const Theme = themes[theme];
  return (
    <Suspense key={theme} fallback={null}>
      <Theme />
    </Suspense>
  );
}
