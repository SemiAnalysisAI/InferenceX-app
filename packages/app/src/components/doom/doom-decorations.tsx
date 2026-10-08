'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export function DoomThemeBanner() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'doom') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="doom-theme-banner">
      <div className="doom-theme-banner">
        <img
          src="/decorative/doom/doom-logo.webp"
          alt="DOOM"
          width={280}
          height={176}
          decoding="async"
        />
        <span className="text-xs font-mono tracking-eyebrow">E1M1: HANGAR</span>
      </div>
    </div>
  );
}

/**
 * Follow the root class, like the other optional themes, because this mounts
 * outside ThemeProvider. No image requests until Doom is selected.
 */
export function DoomDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(document.documentElement.classList.contains('doom'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="doom-scene" data-testid="doom-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/doom/doom-hell-mobile.webp" />
        <img
          className="doom-scene-image"
          src="/decorative/doom/doom-hell.webp"
          alt=""
          width={1920}
          height={1051}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="doom-scene-shade" />
    </div>
  );
}
