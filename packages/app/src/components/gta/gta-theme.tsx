'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import { track } from '@/lib/analytics/analytics';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import { GtaDecorations, GtaThemeBanner } from './gta-decorations';
import { mountGtaRuntime, type GtaRuntime } from './gta-runtime';
import { GtaSiteHud } from './gta-site-hud';
import { onGtaEffect } from './gta-store';
import { STRINGS } from './gta-strings';
import GtaToggles from './gta-toggles';
import './gta-theme.css';

// The phone is a separate chunk that loads the first time it is opened.
const GtaPhoneDialog = dynamic(() => import('./gta-phone'), { ssr: false });

/**
 * Entry of the GTA theme. It is reached only through the lazy theme map, so nothing here loads
 * until the theme is selected. Mounts the runtime (sounds, radio, cheats, chart blips), the
 * scene, the banner, the header toggles, the notification feed and, on demand, the phone.
 */
export default function GtaTheme() {
  const locale = useLocale();
  const pathname = usePathname();
  const strings = STRINGS[locale];
  const stringsRef = useRef(strings);
  stringsRef.current = strings;
  const [runtime, setRuntime] = useState<GtaRuntime | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // The lane (district, feed, titles, lines) is drawn inside the banner's bottom bar.
  const [laneSlot, setLaneSlot] = useState<HTMLElement | null>(null);
  const embed = isEmbedPathname(pathname);

  useEffect(() => {
    if (embed) return;
    const mounted = mountGtaRuntime(() => stringsRef.current);
    setRuntime(mounted);
    return () => {
      setRuntime(null);
      mounted.dispose();
    };
  }, [embed]);

  useEffect(() => {
    runtime?.route(pathname);
  }, [runtime, pathname]);

  useEffect(
    () =>
      onGtaEffect((effect) => {
        if (effect.type !== 'phone') return;
        setPhoneOpen(true);
        track('gta_phone_opened');
      }),
    [],
  );

  if (embed) return null;
  const home = pathname === '/' || pathname === '/zh' || pathname === '/zh/';

  return (
    <>
      <GtaDecorations />
      <ThemeHeaderToggles>
        <GtaToggles />
      </ThemeHeaderToggles>
      <GtaThemeBanner strings={strings} runtime={runtime} compact={!home} laneRef={setLaneSlot} />
      <GtaSiteHud strings={strings} slot={laneSlot} />
      {phoneOpen && (
        <GtaPhoneDialog strings={strings} runtime={runtime} onClose={() => setPhoneOpen(false)} />
      )}
    </>
  );
}
