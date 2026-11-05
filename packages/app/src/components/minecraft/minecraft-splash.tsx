'use client';

import { lazy, useState, useEffect } from 'react';

import { useEasterEggTheme } from '@/lib/themes/use-easter-egg-theme';
import { OptionalThemeBoundary } from '../effects/optional-theme-boundary';
const RandomSplash = lazy(() => import('./minecraft-splash-text'));

const SPLASH_MIN_WIDTH = '(min-width: 1024px)';

export function MinecraftSplash() {
  const theme = useEasterEggTheme();
  const [wideEnough, setWideEnough] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(SPLASH_MIN_WIDTH);
    const sync = () => setWideEnough(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  if (!wideEnough || theme !== 'minecraft') return null;

  return (
    <div className="splash-wrapper" data-testid="splash-text">
      <span className="splash-text">
        <OptionalThemeBoundary>
          <RandomSplash />
        </OptionalThemeBoundary>
      </span>
    </div>
  );
}
