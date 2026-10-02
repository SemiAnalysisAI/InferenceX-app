'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

export function CsgoThemeBanner() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'csgo') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="csgo-theme-banner">
      <div className="csgo-theme-banner">
        <img
          src="/decorative/csgo/csgo-logo.webp"
          alt="Counter-Strike: Global Offensive"
          width={243}
          height={69}
          decoding="async"
        />
        <span className="text-xs font-mono tracking-eyebrow text-primary">DUST II</span>
      </div>
    </div>
  );
}

/**
 * Follow the root class, like Minecraft's decorations, because this mounts
 * outside ThemeProvider. No image requests until CS:GO is selected.
 */
export function CsgoDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(document.documentElement.classList.contains('csgo'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="csgo-scene" data-testid="csgo-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/csgo/dust2-mobile.webp" />
        <img
          className="csgo-scene-image"
          src="/decorative/csgo/dust2.webp"
          alt=""
          width={1920}
          height={1200}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="csgo-scene-shade" />
    </div>
  );
}
