'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';

import { bindCsgoAudio } from './csgo-audio';
import { CsgoBanner } from './csgo-banner';
import { mountCsgoCharts } from './csgo-charts';
import { CsgoScene } from './csgo-scene';
import { csgoCopy } from './csgo-strings';
import { CsgoToggles } from './csgo-toggles';
import { applySide, clearSide, mergeSave, readSave } from './csgo-store';
import './csgo-theme.css';

export default function CsgoThemeRoot() {
  const pathname = usePathname();
  const locale = useLocale();
  const embedded = isEmbedPathname(pathname);
  const [toast, setToast] = useState('');

  useEffect(() => {
    document.documentElement.dataset.csgoLocale = locale;
    return () => {
      delete document.documentElement.dataset.csgoLocale;
    };
  }, [locale]);

  useEffect(() => {
    if (embedded) return;
    applySide();
    const unAudio = bindCsgoAudio();
    const unCharts = mountCsgoCharts();
    return () => {
      unAudio();
      unCharts();
      clearSide();
    };
  }, [embedded]);

  useEffect(() => {
    if (embedded) return;
    let buffer = '';
    let lastChar = '';
    let lastAt = 0;
    const noteChar = (char: string) => {
      if (char.length !== 1) return;
      const lower = char.toLowerCase();
      const now = Date.now();
      if (lower === lastChar && now - lastAt < 40) return;
      lastChar = lower;
      lastAt = now;
      buffer = `${buffer}${lower}`.slice(-8);
      const copy = csgoCopy(locale);
      if (buffer.endsWith('ace')) {
        mergeSave({ xp: readSave().xp + 80, medal: { id: 'ace', tier: 1 } });
        setToast(copy.eggAce);
      } else if (buffer.endsWith('rushb')) {
        mergeSave({ xp: readSave().xp + 80, medal: { id: 'rushb', tier: 1 }, unlocked: ['mp9'] });
        setToast(copy.eggRush);
      } else if (buffer.endsWith('shots')) {
        window.dispatchEvent(new CustomEvent('csgo-meme', { detail: 'shots' }));
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      noteChar(event.key);
    };
    const onBefore = (event: Event) => {
      if (!(event instanceof InputEvent) || !event.data) return;
      noteChar(event.data);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('beforeinput', onBefore, true);
    const started = Date.now();
    const idle = window.setInterval(() => {
      if (Date.now() - started < 8000) return;
      const path = window.location.pathname;
      const home = path === '/' || path === '/zh';
      const chart = path.includes('/inference');
      if (!home && !chart) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (document.querySelector('[data-testid="csgo-payoff"]')) return;
      if (chart && !document.querySelector('[data-testid="d3-chart-svg"]')) return;
      window.dispatchEvent(new CustomEvent('csgo-meme', { detail: 'iwnl' }));
      window.clearInterval(idle);
    }, 500);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('beforeinput', onBefore, true);
      window.clearInterval(idle);
    };
  }, [embedded, locale]);

  useEffect(() => {
    if (embedded) return;
    setToast('');
  }, [embedded, pathname]);

  if (embedded) return null;

  return (
    <>
      <ThemeHeaderToggles>
        <CsgoToggles />
      </ThemeHeaderToggles>
      <CsgoScene />
      <CsgoBanner toast={toast} />
      <p className="csgo-live" aria-live="polite">
        {toast}
      </p>
    </>
  );
}
