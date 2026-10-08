'use client';

import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/use-locale';

/** Mirrors the `@media (min-width: 1024px)` rule that reveals `.splash-wrapper`. */
const SPLASH_MIN_WIDTH = '(min-width: 1024px)';

const ANNOUNCEMENT = {
  en: 'AgentX is here!!',
  zh: 'AgentX 来了！！',
} as const;

/**
 * Splash text — yellow, rotated launch callout on the landing page.
 * It says the same thing on every load.
 */
export function AgentxSplash() {
  const locale = useLocale();
  const [wideEnough, setWideEnough] = useState(false);

  // `.splash-wrapper` is `display: none` below 1024px. Gate the element out of
  // the tree below the same breakpoint so phones never render it. Starts
  // `false` so the server render and the first client render agree.
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
      <span className="splash-text">{ANNOUNCEMENT[locale]}</span>
    </div>
  );
}
