'use client';

import { lazy } from 'react';
import { useEasterEggTheme } from '@/lib/themes/use-easter-egg-theme';
import { OptionalThemeBoundary } from '../effects/optional-theme-boundary';

const Toggles = lazy(() =>
  import('./minecraft-toggles').then((module) => ({
    default: module.MinecraftToggles,
  })),
);

export function MinecraftTogglesLazy() {
  const theme = useEasterEggTheme();
  return theme === 'minecraft' ? (
    <OptionalThemeBoundary>
      <Toggles />
    </OptionalThemeBoundary>
  ) : null;
}
