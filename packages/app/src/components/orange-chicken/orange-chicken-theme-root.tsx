'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Music, Volume2, VolumeOff } from 'lucide-react';

import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import { track } from '@/lib/analytics/analytics';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import { foodDataUri } from './orange-chicken-art';
import { playOcSfx, toggleOcMusic, toggleOcSound, unlockOcAudio } from './orange-chicken-audio';
import { CHART_EVENTS, CHART_WORDS } from './orange-chicken-chart-strings';
import { emitLine } from './orange-chicken-lines';
import { BannerPlaces } from './orange-chicken-menu';
import { BannerStage } from './orange-chicken-stage';
import { BannerHero, BannerLogo, BannerPlate } from './orange-chicken-plate';
import { BANNER } from './orange-chicken-banner-strings';
import { mountChickenCharts } from './orange-chicken-charts';
import OrangeChickenFx from './orange-chicken-fx';
import { mountChickenMemes, payChitOnAbout } from './orange-chicken-memes';
import { mountChickenRuntime } from './orange-chicken-runtime';
import { OrangeChickenScene } from './orange-chicken-scene';
import {
  MODES,
  SECRET_IDS,
  calmEnabled,
  discoverSecret,
  emitOcEffect,
  getOcState,
  getServerOcState,
  setCalm,
  setMode,
  subscribeOc,
  type SecretId,
} from './orange-chicken-store';
import { STRINGS } from './orange-chicken-strings';
import OrangeChickenToggles from './orange-chicken-toggles';
import './orange-chicken-theme.css';

// The game is its own chunk: it loads only after the Play button is pressed.
const OrangeChickenGame = dynamic(() => import('./orange-chicken-game'), { ssr: false });

const EFFECT_OF_SECRET: Partial<Record<SecretId, Parameters<typeof emitOcEffect>[0]['type']>> = {
  wok: 'wok',
  konami: 'rain',
  sesame: 'sesame',
  fortune: 'fortune',
  seal: 'seal',
  bell: 'bell',
  idle: 'idle',
};

function useOcState() {
  return useSyncExternalStore(subscribeOc, getOcState, getServerOcState);
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

type Panel = 'line' | 'more';

function Banner({ compact, trigger }: { compact: boolean; trigger: (id: SecretId) => void }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const b = t.banner;
  const l = BANNER[locale];
  const state = useOcState();
  const wide = useMedia('(min-width: 1100px)');
  const phone = useMedia('(max-width: 640px)');
  const [gameOpen, setGameOpen] = useState(false);
  const bannerPath = usePathname();
  const lastPath = useRef(bannerPath);
  const [calm, setCalmState] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const launch = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const lineButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCalmState(calmEnabled());
  }, []);

  // Any route change, including Back and Forward, ends the shift: the modal, loop and audio go with it.
  useEffect(() => {
    if (lastPath.current === bannerPath) return;
    lastPath.current = bannerPath;
    setGameOpen(false);
  }, [bannerPath]);

  const pickMode = (mode: (typeof MODES)[number]) => {
    setMode(mode);
    playOcSfx('pop');
    if (
      mode !== 'glaze' ||
      !emitLine('original', {
        en: 'The Original palette: glaze on, nothing added.',
        zh: '“原味”配色：糖釉上桌，不加别的。',
      })
    ) {
      emitOcEffect({ type: 'toast', text: t.toasts.modes[mode] });
    }
  };

  const inlineLine = !compact && wide;
  const lineInDrawer = !compact && !wide;
  const open: Panel | null = panel === 'line' && !lineInDrawer ? null : panel;
  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next));
  // On a phone the journal (and, on the home banner, the fortune cookie) live in the drawer so the strip fits.
  const slimFortune = phone && !compact;
  const slimJournal = phone;

  const fortune = (
    <button type="button" className="oc-chip" onClick={() => trigger('fortune')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={foodDataUri('cookie')} alt="" width={20} height={20} />
      {t.journal.secrets.fortune.name}
    </button>
  );
  const journal = (
    <button
      type="button"
      className="oc-chip"
      aria-haspopup="dialog"
      onClick={() => emitOcEffect({ type: 'journal' })}
    >
      {b.journal} {state.found.length}/{SECRET_IDS.length}
    </button>
  );

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="orange-chicken-theme-banner">
      <section
        className="oc-banner no-export"
        aria-label={b.title}
        data-compact={compact ? 'true' : 'false'}
        data-wide={wide ? 'true' : 'false'}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return;
          const back = open === 'line' ? lineButton.current : moreButton.current;
          setPanel(null);
          back?.focus();
        }}
      >
        <div className="oc-b-id">
          <BannerLogo compact={compact} />
          <div className="oc-b-name">
            <p className="oc-b-kicker">
              <strong>{t.ip.kicker}</strong>
              <small>{t.ip.descriptor}</small>
            </p>
            <p className="oc-banner-title">
              <button
                type="button"
                className="oc-seal"
                aria-label={b.sealLabel}
                title={b.sealLabel}
                onClick={() => trigger('seal')}
              >
                鸡
              </button>
              <span>{b.title}</span>
            </p>
          </div>
        </div>
        <div className="oc-b-actions">
          <button
            ref={launch}
            type="button"
            className="oc-chip oc-chip-play"
            data-testid="orange-chicken-play"
            aria-haspopup="dialog"
            title={b.playHint}
            onClick={() => {
              unlockOcAudio();
              playOcSfx('bell');
              emitLine('wokon', {
                en: 'The Wok Kitchen is open: batch, precision and the counter are yours.',
                zh: '炒锅厨房开张：批量、精度和柜台都交给你。',
              });
              setGameOpen(true);
              track('orange_chicken_game_opened');
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foodDataUri('chicken')} alt="" width={20} height={20} />
            {b.play}
          </button>
          {!slimFortune && fortune}
          {!slimJournal && journal}
          {lineInDrawer && (
            <button
              ref={lineButton}
              type="button"
              className="oc-chip"
              aria-expanded={open === 'line'}
              aria-controls="oc-drawer-line"
              onClick={() => toggle('line')}
            >
              {l.walk}
            </button>
          )}
          <button
            ref={moreButton}
            type="button"
            className="oc-chip"
            aria-expanded={open === 'more'}
            aria-controls="oc-drawer-more"
            onClick={() => toggle('more')}
          >
            {l.more}
          </button>
        </div>
        {!compact && (
          <div className="oc-b-hero">
            <BannerHero />
          </div>
        )}
        {inlineLine && (
          <div className="oc-b-line">
            <BannerStage />
          </div>
        )}
        <div className="oc-rail" data-oc-rail="" />
        {open === 'line' && (
          <div className="oc-drawer oc-drawer-line" id="oc-drawer-line">
            <BannerStage withLogo />
          </div>
        )}
        {open === 'more' && (
          <div className="oc-drawer oc-drawer-more" id="oc-drawer-more">
            <div className="oc-drawer-col">
              <p className="oc-drawer-title">{l.morePanel}</p>
              {!compact && <p className="oc-banner-desc">{b.description}</p>}
              {!compact && <p className="oc-banner-desc oc-banner-motto">{l.motto}</p>}
              <div className="oc-banner-tools">
                <span role="group" aria-label={b.menu} className="contents">
                  {MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="oc-chip"
                      aria-pressed={state.mode === mode}
                      data-testid={`orange-chicken-mode-${mode}`}
                      onClick={() => pickMode(mode)}
                    >
                      <span className="oc-swatch" data-mode={mode} aria-hidden="true" />
                      {b.modes[mode]}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className="oc-chip"
                  aria-pressed={calm}
                  title={b.calmOn}
                  onClick={() => {
                    const next = !calm;
                    setCalm(next);
                    setCalmState(next);
                  }}
                >
                  {b.calm}
                </button>
                {slimFortune && fortune}
                {slimJournal && journal}
                <button
                  type="button"
                  className="oc-chip"
                  aria-pressed={state.sound}
                  aria-label={state.sound ? t.toggles.muteSound : t.toggles.unmuteSound}
                  onClick={toggleOcSound}
                >
                  {state.sound ? <Volume2 className="size-4" /> : <VolumeOff className="size-4" />}
                  {b.sound}
                </button>
                <button
                  type="button"
                  className="oc-chip"
                  aria-pressed={state.music}
                  aria-label={state.music ? t.toggles.muteMusic : t.toggles.unmuteMusic}
                  onClick={toggleOcMusic}
                >
                  <Music className="size-4" />
                  {b.music}
                </button>
              </div>
            </div>
            {!compact && (
              <div className="oc-drawer-col">
                <BannerPlaces />
              </div>
            )}
            {!compact && (
              <div className="oc-drawer-col">
                <BannerPlate trigger={trigger} />
              </div>
            )}
          </div>
        )}
      </section>
      {gameOpen && (
        <OrangeChickenGame
          onClose={() => {
            setGameOpen(false);
            track('orange_chicken_game_closed');
            launch.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default function OrangeChickenTheme() {
  const pathname = usePathname();
  const locale = useLocale();
  const embedded = isEmbedPathname(pathname);
  const state = useOcState();
  const trigger = useCallback(
    (id: SecretId) => {
      const fresh = discoverSecret(id);
      const effect = EFFECT_OF_SECRET[id];
      if (effect) emitOcEffect({ type: effect } as Parameters<typeof emitOcEffect>[0]);
      if (fresh) {
        track('orange_chicken_secret', { id });
        if (getOcState().found.length >= SECRET_IDS.length) {
          emitOcEffect({ type: 'toast', text: STRINGS[locale].toasts.allFound });
        }
      }
    },
    [locale],
  );

  // Interface sounds, secrets and the chart decorations are page-wide.
  useEffect(() => {
    if (embedded) return;
    const runtime = mountChickenRuntime(trigger);
    const memes = mountChickenMemes();
    const unmountCharts = mountChickenCharts({
      orderLabel: (n) => `${locale === 'zh' ? '订单' : 'ORDER'} ${n}`,
      words: CHART_WORDS[locale],
      onEmpty: () => emitLine('wokon', CHART_EVENTS.empty),
      onExport: () => emitLine('fortune', CHART_EVENTS.export),
      onLeader: ({ name }) =>
        emitLine('better', {
          en: CHART_EVENTS.leader.en.replace('{name}', name),
          zh: CHART_EVENTS.leader.zh.replace('{name}', name),
        }),
    });
    return () => {
      unmountCharts();
      memes.dispose();
      runtime.dispose();
    };
  }, [embedded, trigger, locale]);

  // The end of the order chit chain: the About page pays it out once.
  useEffect(() => {
    if (embedded || !/^(?:\/zh)?\/about\/?$/u.test(pathname)) return;
    const id = window.setTimeout(payChitOnAbout, 1400);
    return () => window.clearTimeout(id);
  }, [embedded, pathname]);

  // Sub-palette and the persisted calm switch live on the root element while the theme is mounted.
  useEffect(() => {
    if (embedded) return;
    const root = document.documentElement;
    root.dataset.ocMode = state.mode;
    return () => {
      delete root.dataset.ocMode;
    };
  }, [embedded, state.mode]);

  // The chart cards draw a few words of their own in CSS (sold out, loading); they follow the locale.
  useEffect(() => {
    if (embedded) return;
    const root = document.documentElement;
    root.dataset.ocLang = locale;
    return () => {
      delete root.dataset.ocLang;
    };
  }, [embedded, locale]);

  useEffect(() => {
    if (embedded) return;
    const root = document.documentElement;
    root.toggleAttribute('data-oc-still', calmEnabled());
    return () => {
      delete root.dataset.ocStill;
    };
  }, [embedded]);

  const home = pathname === '/' || pathname === '/zh';
  return (
    <>
      <ThemeHeaderToggles>
        <OrangeChickenToggles />
      </ThemeHeaderToggles>
      {!embedded && <Banner compact={!home} trigger={trigger} />}
      {!embedded && <OrangeChickenScene />}
      {!embedded && <OrangeChickenFx />}
    </>
  );
}
