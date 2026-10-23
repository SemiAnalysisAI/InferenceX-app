'use client';

import { lazy } from 'react';
import { useEasterEggTheme } from '@/lib/themes/use-easter-egg-theme';
import { OptionalThemeBoundary } from '../effects/optional-theme-boundary';

const Toggles = lazy(() =>
  import('./halo-toggles').then((module) => ({
    default: module.HaloToggles,
  })),
);

export function HaloTogglesLazy() {
  const theme = useEasterEggTheme();
  return theme === 'halo' ? (
    <OptionalThemeBoundary>
      <Toggles />
    </OptionalThemeBoundary>
  ) : null;
}
