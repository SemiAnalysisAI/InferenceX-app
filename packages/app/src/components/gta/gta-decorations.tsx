'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const GtaHeistDialog = dynamic(() => import('./gta-heist-dialog'), { ssr: false });

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
  const [heistOpen, setHeistOpen] = useState(false);
  const locale = useLocale();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (resolvedTheme !== 'gta') setHeistOpen(false);
  }, [resolvedTheme]);
  if (!mounted || resolvedTheme !== 'gta') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="gta-theme-banner">
      <div className="gta-theme-banner">
        <picture className="gta-banner-art" aria-hidden="true">
          <source media="(max-width: 640px)" srcSet="/decorative/gta/vinewood-mobile.webp" />
          <img
            src="/decorative/gta/vinewood.webp"
            alt=""
            width={1600}
            height={996}
            decoding="async"
            draggable={false}
          />
        </picture>
        <div className="gta-banner-shade" aria-hidden="true" />
        {/* Real text so assistive tech reads "Grand Theft InferenceX"; the
            spaces collapse visually because the lines are flex items. */}
        <p className="gta-wordmark">
          <span>Grand</span> <span>Theft</span> <span className="gta-wordmark-big">InferenceX</span>
        </p>
        <div className="gta-wanted" role="img" aria-label="Wanted level: five stars">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} />
          ))}
        </div>
        <div className="gta-heist-launcher">
          <span>{locale === 'zh' ? '湾区劫案' : 'BAY AREA HEIST'}</span>
          <button
            type="button"
            data-testid="gta-heist-launch"
            onClick={() => {
              setHeistOpen(true);
              track('gta_heist_opened');
            }}
          >
            {locale === 'zh' ? '开始驾驶 →' : 'Start heist →'}
          </button>
        </div>
      </div>
      {heistOpen && (
        <GtaHeistDialog
          onClose={() => {
            setHeistOpen(false);
            track('gta_heist_closed');
          }}
        />
      )}
    </div>
  );
}

/**
 * Follow the root class, like the CS:GO and Minecraft decorations, because
 * this mounts outside ThemeProvider. Artwork loads only while GTA is active.
 */
export function GtaDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () =>
      setActive(
        document.documentElement.classList.contains('gta') &&
          !Object.hasOwn(document.documentElement.dataset, 'inferencexEmbed'),
      );
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="gta-scene" data-testid="gta-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/gta/trio-mobile.webp" />
        <img
          className="gta-scene-image"
          src="/decorative/gta/trio.webp"
          alt=""
          width={1920}
          height={1190}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="gta-scene-shade" />
    </div>
  );
}
