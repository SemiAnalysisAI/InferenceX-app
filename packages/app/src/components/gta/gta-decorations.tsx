'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Smartphone } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { countGtaBlips } from './gta-charts';
import type { GtaRuntime } from './gta-runtime';
import {
  CHARACTERS,
  MAX_WANTED,
  FIND_IDS,
  emitGtaEffect,
  getGtaState,
  getServerGtaState,
  prefersReducedMotion,
  rankIndex,
  subscribeGta,
} from './gta-store';
import { fill, formatTime, type GtaStrings } from './gta-strings';
import { mountGtaTraffic } from './gta-traffic';

const GtaHeistDialog = dynamic(() => import('./gta-heist-dialog'), { ssr: false });

const SPLASH_MS = 7000;
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const money = (amount: number) => `$${new Intl.NumberFormat('en-US').format(amount)}`;

function Star({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" data-lit={lit}>
      <path d={STAR_PATH} stroke="#000" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function useGtaState() {
  return useSyncExternalStore(subscribeGta, getGtaState, getServerGtaState);
}

function useSplash(lines: readonly string[]): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(Math.floor(Math.random() * lines.length));
    // With reduced motion the line that came up first stays; nothing rotates on its own.
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % lines.length);
    }, SPLASH_MS);
    return () => window.clearInterval(id);
  }, [lines.length]);
  return lines[index % lines.length];
}

function useBlipCount(pathname: string | null): number {
  const [blips, setBlips] = useState(0);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setBlips(countGtaBlips());
    };
    const first = window.setTimeout(update, 900);
    const id = window.setInterval(update, 2500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [pathname]);
  return blips;
}

/**
 * The corner radar: the Los Santos map from San Andreas (set as the background in the theme
 * stylesheet) with a GPS route that follows the scroll position.
 */
function Radar({ label, blips }: { label: string; blips: number }) {
  return (
    <div className="gta-radar" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 132 88" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="gta-radar-route" d="M22 8v14h36v26h38v12" />
        <circle className="gta-radar-blip" data-blip="a" cx="96" cy="60" r="4" />
        <rect className="gta-radar-blip" data-blip="b" x="38" y="30" width="7" height="7" />
        <path className="gta-radar-blip" data-blip="c" d="M112 16l5 8h-10z" />
      </svg>
      <span className="gta-radar-player" aria-hidden="true" />
      <span className="gta-radar-north" aria-hidden="true">
        N
      </span>
      <span className="gta-radar-count" aria-hidden="true">
        {blips}
      </span>
    </div>
  );
}

export function GtaThemeBanner({
  strings,
  runtime,
  compact,
  laneRef,
}: {
  strings: GtaStrings;
  runtime: GtaRuntime | null;
  compact: boolean;
  /** Receives the element in the bottom bar that the site HUD lane is drawn into. */
  laneRef: (node: HTMLElement | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const state = useGtaState();
  const splash = useSplash(strings.splash);
  const blips = useBlipCount(pathname);
  const stashOpen = (pathname === '/' || pathname === '/zh') && (runtime?.stashStage() ?? 0) < 2;
  const [mounted, setMounted] = useState(false);
  const [heistOpen, setHeistOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (resolvedTheme !== 'gta') setHeistOpen(false);
  }, [resolvedTheme]);
  // The game belongs to the page it was opened on: any change of route, the browser's Back
  // and Forward included, closes it, which stops its loop and gives scroll and focus back.
  useEffect(() => setHeistOpen(false), [pathname]);
  if (!mounted || resolvedTheme !== 'gta') return null;

  const t = strings.banner;
  const rank = t.ranks[rankIndex(state.cash)];
  const found = state.found.length / FIND_IDS.length;
  const heist =
    state.heist.passed > 0
      ? fill(t.heistRecord, {
          n: state.heist.passed,
          time: formatTime(state.heist.best),
          take: money(state.heist.take),
        })
      : t.heistNone;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="gta-theme-banner">
      <section
        className="gta-theme-banner no-export"
        aria-label={t.label}
        data-compact={compact ? 'true' : 'false'}
      >
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

        <div className="gta-banner-title">
          <button
            type="button"
            className="gta-wordmark"
            title={strings.secrets.wordmark.name}
            onClick={() => runtime?.wordmark()}
          >
            <span>Grand</span> <span>Theft</span>{' '}
            <span className="gta-wordmark-big">InferenceX</span>
          </button>
          {/* On the home page Lester's tip holds the tip line until his blips are tagged. */}
          <p
            className="gta-banner-splash"
            key={stashOpen ? 'stash' : splash}
            data-testid={stashOpen ? 'gta-stash-clue' : undefined}
          >
            {stashOpen ? strings.feed.stashHint : splash}
          </p>
        </div>

        <div className="gta-banner-hud">
          <div
            className="gta-wanted"
            role="img"
            aria-label={fill(t.wanted, { n: state.wanted })}
            data-wanted={state.wanted}
          >
            {Array.from({ length: MAX_WANTED }, (_, index) => (
              <Star key={index} lit={index >= MAX_WANTED - state.wanted} />
            ))}
          </div>
          <button
            type="button"
            className="gta-banner-cash"
            data-testid="gta-banner-cash"
            aria-haspopup="dialog"
            title={t.cashHint}
            aria-label={`${t.cash} ${money(state.cash)}. ${t.phoneHint}`}
            onClick={() => emitGtaEffect({ type: 'phone' })}
          >
            {/* Zero-padded to eight digits, as the San Andreas HUD shows cash. */}
            <span key={state.cash}>
              ${String(Math.min(state.cash, 99_999_999)).padStart(8, '0')}
            </span>
          </button>
          <p className="gta-banner-rank">
            <span>{t.rank}</span> {rank}
          </p>
        </div>

        <div className="gta-banner-radar">
          <Radar label={t.radar} blips={blips} />
          <div className="gta-radar-bars" aria-hidden="true">
            <span className="gta-radar-bar" data-bar="health" title={t.health}>
              <span />
            </span>
            <span className="gta-radar-bar" data-bar="armor" title={t.armor}>
              <span style={{ width: `${(found * 100).toFixed(1)}%` }} />
            </span>
            <span className="gta-radar-bar" data-bar="special" title={t.special}>
              <span style={{ width: `${(state.wanted / MAX_WANTED) * 100}%` }} />
            </span>
          </div>
        </div>

        <div className="gta-switch">
          <div className="gta-switch-chips" role="group" aria-label={t.switchLabel}>
            {CHARACTERS.map((character) => (
              <button
                key={character}
                type="button"
                className="gta-switch-chip"
                data-char={character}
                data-testid={`gta-switch-${character}`}
                aria-pressed={state.character === character}
                title={strings.characters[character].mood}
                onClick={() => {
                  runtime?.switchCharacter(character);
                  track('gta_character_switched', { character });
                }}
              >
                <span className="gta-switch-dot" aria-hidden="true" />
                {strings.characters[character].name}
              </button>
            ))}
          </div>
          <div className="gta-banner-lane" ref={laneRef} />
          <button
            type="button"
            className="gta-switch-chip gta-phone-button"
            data-testid="gta-phone-open"
            aria-haspopup="dialog"
            title={t.phoneHint}
            onClick={() => emitGtaEffect({ type: 'phone' })}
          >
            <Smartphone className="size-4" aria-hidden="true" />
            <span className="gta-phone-label">{t.phone}</span>
            <span className="gta-phone-count">
              {fill(t.secrets, { found: state.found.length, total: FIND_IDS.length })}
            </span>
          </button>
        </div>

        <div className="gta-heist-launcher">
          <span className="gta-heist-poster" aria-hidden="true" />
          <span>{t.heistTitle}</span>
          <p className="gta-heist-record" data-testid="gta-heist-record">
            {heist}
          </p>
          <button
            type="button"
            data-testid="gta-heist-launch"
            onClick={() => {
              setHeistOpen(true);
              track('gta_heist_opened');
            }}
          >
            {t.heistStart}
          </button>
        </div>
      </section>
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

const PALM =
  'M50 200c2-50 0-90-6-128-14-4-30 0-40 12 6-18 22-26 38-22C30 52 14 50 2 58c10-14 30-18 44-8-4-14-14-24-28-26 16-4 30 6 34 22 2-18 14-30 30-30-12 6-18 18-20 32 12-12 30-12 42 0-14-4-28 0-38 10 16-2 30 8 34 24-10-12-24-16-40-12 8 38 10 80 6 130z';

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

  const traffic = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || !traffic.current) return;
    return mountGtaTraffic(traffic.current);
  }, [active]);

  if (!active) return null;

  return (
    <div className="gta-scene" data-testid="gta-scene" aria-hidden="true">
      <div className="gta-scene-sky" />
      <div className="gta-scene-sun" />
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
      <div className="gta-scene-beams">
        <span />
        <span />
      </div>
      <svg
        className="gta-scene-skyline"
        viewBox="0 0 1600 260"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <path
          className="gta-skyline-far"
          d="M0 260V190h60v-30h50v30h70v-60h40v-24h36v24h30v60h80v-90h24v-30h30v30h26v90h90v-50h60v50h50V96h20V60h30v36h22v104h70v-70h44v70h60v-40h70v40h50v-96h30v-22h34v22h28v96h80v-56h56v56h60v-80h40v80h70v-44h60v44h60v70z"
        />
        <path
          className="gta-skyline-near"
          d="M0 260v-40h90v-46h64v46h40v-84h26v-18h44v18h24v84h70v-30h110v30h44v-124h18v-26h12v-22h8v22h12v26h20v124h60v-58h84v58h50v-96h70v96h64v-36h96v36h40v-70h30v-16h50v16h28v70h90v-44h70v44h56v-104h64v104h60v40z"
        />
        <g className="gta-skyline-windows">
          <path d="M214 150h8v8h-8zm22 0h8v8h-8zm-22 22h8v8h-8zm22 22h8v8h-8zM528 120h6v10h-6zm16 26h6v10h-6zm-16 28h6v10h-6zm16 30h6v10h-6zM756 140h10v8h-10zm24 22h10v8h-10zm-24 26h10v8h-10zM1086 170h8v8h-8zm22 20h8v8h-8zM1360 136h10v10h-10zm24 26h10v10h-10zm-24 28h10v10h-10z" />
        </g>
      </svg>
      <svg className="gta-scene-palms" data-side="left" viewBox="0 0 130 200" focusable="false">
        <path d={PALM} />
      </svg>
      <svg className="gta-scene-palms" data-side="right" viewBox="0 0 130 200" focusable="false">
        <path d={PALM} />
      </svg>
      <canvas className="gta-scene-traffic" ref={traffic} />
      <div className="gta-scene-blimp">
        <svg viewBox="0 0 160 60" width="160" height="60" focusable="false">
          <path d="M8 26c20-22 96-26 136-4 8 4 8 8 0 12-40 22-116 18-136-4-2-2-2-2 0-4z" />
          <path d="M132 14l22-10v18zM132 42l22 10V34z" />
          <path d="M62 46h30l-4 10H66z" />
        </svg>
      </div>
      <div className="gta-scene-weather" />
      <div className="gta-scene-heat" />
      <div className="gta-scene-vignette" />
    </div>
  );
}
