'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/use-locale';

export function HaloThemeBanner() {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'halo') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="halo-theme-banner">
      <div className="halo-theme-banner">
        <picture className="halo-banner-art" aria-hidden="true">
          <source media="(max-width: 640px)" srcSet="/decorative/halo/ring-vista-mobile.webp" />
          <img
            src="/decorative/halo/ring-vista.webp"
            alt=""
            width={1600}
            height={861}
            decoding="async"
            draggable={false}
          />
        </picture>
        <div className="halo-banner-shade" aria-hidden="true" />
        <div className="halo-banner-title">
          <img
            className="halo-logo"
            src="/decorative/halo/halo-logo.webp"
            alt="Halo"
            width={720}
            height={103}
            decoding="async"
          />
          <p className="halo-wordmark">InferenceX</p>
          <p className="halo-tagline">
            {locale === 'zh' ? 'Inference Evolved · 基准测试永无止境' : 'Inference Evolved'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Follow the root class like the other optional themes, because this mounts
 * outside ThemeProvider. No image requests until Halo is selected.
 */
export function HaloDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const check = () =>
      setActive(root.classList.contains('halo') && !Object.hasOwn(root.dataset, 'inferencexEmbed'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="halo-scene" data-testid="halo-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/halo/zeta-halo-mobile.webp" />
        <img
          className="halo-scene-image"
          src="/decorative/halo/zeta-halo.webp"
          alt=""
          width={1920}
          height={975}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="halo-scene-shade" />
    </div>
  );
}
