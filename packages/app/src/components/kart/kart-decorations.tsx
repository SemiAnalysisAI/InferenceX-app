'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import './kart-theme.css';

const KartDialog = dynamic(() => import('./kart-dialog'), { ssr: false });

export function KartDecorations() {
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
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="kart-theme-banner">
      <div className="kart-theme-banner">
        <div className="kart-banner-title">
          <span>MARIO KART</span>
          <strong>Luigi Circuit</strong>
        </div>
        <div className="kart-banner-launch">
          <span>
            {locale === 'zh' ? '三圈 · 八辆赛车 · 3D 竞速' : '3 LAPS · 8 RACERS · 3D RACING'}
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

export default function KartTheme() {
  return (
    <>
      <KartDecorations />
      <KartThemeBanner />
    </>
  );
}
