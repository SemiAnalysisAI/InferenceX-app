'use client';

import { lazy, Suspense, useState, useEffect } from 'react';

import { useLocale } from '@/lib/use-locale';
import { useEasterEggTheme } from '@/lib/use-easter-egg-theme';
const RandomSplash = lazy(() => import('./minecraft-splash-text'));

/**
 * Splash shown outside the minecraft theme. Light and dark mode get a single
 * fixed announcement rather than the random rotation — the rotation is a
 * minecraft-theme easter egg, while this is a launch callout that has to say
 * the same thing on every load.
 */
/** Mirrors the `@media (min-width: 1024px)` rule that reveals `.splash-wrapper`. */
const SPLASH_MIN_WIDTH = '(min-width: 1024px)';

const ANNOUNCEMENT = {
  en: 'AgentX is here!!',
  zh: 'AgentX 来了！！',
} as const;

/**
 * Splash text — yellow, rotated, bouncing text (Minecraft title screen style)
 * on the landing page. Light and dark mode show the fixed AgentX announcement;
 * the minecraft theme keeps the random per-load rotation.
 */
export function MinecraftSplash() {
  const locale = useLocale();
  const theme = useEasterEggTheme();
  const [wideEnough, setWideEnough] = useState(false);

  // `.splash-wrapper` is `display: none` below 1024px, but hiding it in CSS is
  // not enough: the browser still fetches the Monocraft webfont the splash
  // asks for, so a phone pays for a font it never paints. Gate the element out
  // of the tree entirely below the same breakpoint the stylesheet uses.
  // Starts `false` so the server render and the first client render agree.
  useEffect(() => {
    const query = window.matchMedia(SPLASH_MIN_WIDTH);
    const sync = () => setWideEnough(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  if (!wideEnough) return null;

  return (
    <div className="splash-wrapper" data-testid="splash-text">
      <span className="splash-text">
        {theme === 'minecraft' ? (
          <Suspense fallback={ANNOUNCEMENT[locale]}>
            <RandomSplash />
          </Suspense>
        ) : (
          ANNOUNCEMENT[locale]
        )}
      </span>
    </div>
  );
}
