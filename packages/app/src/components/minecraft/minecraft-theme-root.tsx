'use client';

import { useEffect, useRef } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { MinecraftBackground } from './minecraft-background';
import { MinecraftDecorations } from './minecraft-decorations';
import { MinecraftPlayBanner } from './minecraft-play-banner';
import { grantAdvancementEvent, mountMinecraftSite } from './minecraft-site';
import './minecraft-theme.css';
import './minecraft-depth.css';

/** Mounts the chart skin, advancements, dimensions and typed eggs for as long as the theme is on. */
function MinecraftSite() {
  const locale = useLocale();
  const localeRef = useRef(locale);
  const firstLocale = useRef(locale);

  useEffect(() => {
    localeRef.current = locale;
    if (locale !== firstLocale.current) grantAdvancementEvent('language');
  }, [locale]);

  useEffect(() => mountMinecraftSite(() => localeRef.current), []);
  return null;
}

export default function MinecraftThemeRoot() {
  return (
    <>
      <MinecraftBackground />
      <MinecraftDecorations />
      <MinecraftPlayBanner />
      <MinecraftSite />
    </>
  );
}
