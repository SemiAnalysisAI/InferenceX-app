'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

function Star() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill="currentColor"
        stroke="#000"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GtaThemeBanner() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'gta') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="gta-theme-banner">
      <div className="gta-theme-banner">
        <p className="gta-wordmark" aria-label="Grand Theft Inference">
          <span aria-hidden="true">Grand</span>
          <span aria-hidden="true">Theft</span>
          <span aria-hidden="true" className="gta-wordmark-big">
            Inference
          </span>
        </p>
        <div className="gta-wanted" role="img" aria-label="Wanted level: five stars">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Follow the root class, like the CS:GO and Minecraft decorations, because
 * this mounts outside ThemeProvider. Pure CSS backdrop: no network requests.
 */
export function GtaDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(document.documentElement.classList.contains('gta'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return <div className="gta-scene" data-testid="gta-scene" aria-hidden="true" />;
}
