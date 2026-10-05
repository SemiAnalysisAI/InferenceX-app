'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const KartDialog = dynamic(() => import('./kart-dialog'), { ssr: false });

function useKartActive() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const check = () =>
      setActive(
        document.documentElement.classList.contains('kart') &&
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
  return active;
}
export function KartDecorations() {
  if (!useKartActive()) return null;
  return (
    <div className="kart-scene" data-testid="kart-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/kart/circuit-mobile.webp" />
        <img
          src="/decorative/kart/circuit.webp"
          alt=""
          width={1600}
          height={900}
          decoding="async"
          draggable={false}
        />
      </picture>
    </div>
  );
}
export function KartThemeBanner() {
  const active = useKartActive();
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active || resolvedTheme !== 'kart') setOpen(false);
  }, [active, resolvedTheme]);
  if (!active) return null;
  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="kart-theme-banner">
      <div className="kart-theme-banner">
        <div className="kart-banner-title">
          <span>MARIO KART</span>
          <strong>Luigi Circuit</strong>
        </div>
        <div className="kart-banner-launch">
          <span>
            {locale === 'zh' ? '三圈 · 四辆赛车 · 3D 竞速' : '3 LAPS · 4 RACERS · 3D RACING'}
          </span>
          <button
            type="button"
            data-testid="kart-launch"
            onClick={() => {
              setOpen(true);
              track('kart_race_opened');
            }}
          >
            {locale === 'zh' ? '开始 3D 比赛 →' : 'Race in 3D →'}
          </button>
        </div>
      </div>
      {open && (
        <KartDialog
          onClose={() => {
            setOpen(false);
            track('kart_race_closed');
          }}
        />
      )}
    </div>
  );
}
