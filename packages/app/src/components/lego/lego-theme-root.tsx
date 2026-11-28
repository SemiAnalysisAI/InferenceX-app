'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

import { track } from '@/lib/analytics/analytics';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import { countLegoPieces } from './lego-charts';
import { mountLegoRuntime, type LegoRuntime } from './lego-runtime';
import { LegoScene } from './lego-scene';
import {
  BOOKLETS,
  MAT_IDS,
  FIND_IDS,
  TRUE_BUILDER_GOAL,
  emitLegoEffect,
  getLegoState,
  getServerLegoState,
  onLegoEffect,
  setMat,
  subscribeLego,
  syncBuiltSets,
} from './lego-store';
import { STRINGS, fill, type LegoStrings } from './lego-strings';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import LegoToggles from './lego-toggles';
import './lego-theme.css';

// The mini-game is a separate chunk that loads when its button is pressed.
const LegoGameDialog = dynamic(() => import('./lego-game'), { ssr: false });
// So is the set instructions journal, opened from the stud counter.
const LegoJournalDialog = dynamic(() => import('./lego-journal'), { ssr: false });

const IMG = '/decorative/lego/img/';

type Place = 'bricksburg' | 'legoHouse' | 'miniland';
/** Postcards in the box drawer: the three page places and two more from the same world. */
const POSTCARDS = [
  { id: 'bricksburg', file: 'place-bricksburg.webp' },
  { id: 'legoHouse', file: 'place-lego-house.webp' },
  { id: 'miniland', file: 'place-miniland.webp' },
  { id: 'legoCity', file: 'place-lego-city.webp' },
  { id: 'dextersDiner', file: 'place-dexters-diner.webp' },
] as const;
const PLACE_FILES: Record<Place, string> = {
  bricksburg: 'place-bricksburg.webp',
  legoHouse: 'place-lego-house.webp',
  miniland: 'place-miniland.webp',
};
function markClue(stage: string): void {
  try {
    sessionStorage.setItem(CHAIN_SLOT, stage);
  } catch {
    // Storage is blocked: the last page still answers, without the reward.
  }
  track('lego_clue_followed', { stage });
}

/** Home is Bricksburg, the pages about the project are LEGO House, the benchmark pages Miniland. */
function placeFor(pathname: string | null): Place {
  const path = (pathname ?? '/').replace(/^\/zh(?=\/|$)/, '') || '/';
  if (path === '/') return 'bricksburg';
  if (/^\/(?:overview|about)(?:\/|$)/.test(path)) return 'legoHouse';
  return 'miniland';
}
const SPLASH_MS = 7000;
const LOGO_CLICKS = 5;
const CHAIN_SLOT = 'lego-chain';
/** How far the table moves for each pixel the page scrolls. */
const MAT_DRIFT = 0.18;
/** The table pattern repeats every this many pixels, so the drift can wrap without a seam. */
const MAT_PERIOD = 112;

function useLegoState() {
  return useSyncExternalStore(subscribeLego, getLegoState, getServerLegoState);
}

function useSplash(lines: readonly string[]): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(Math.floor(Math.random() * lines.length));
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % lines.length);
    }, SPLASH_MS);
    return () => window.clearInterval(id);
  }, [lines.length]);
  return lines[index % lines.length];
}

function usePieceCount(pathname: string | null): number {
  const [pieces, setPieces] = useState(0);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setPieces(countLegoPieces());
    };
    const first = window.setTimeout(update, 800);
    const id = window.setInterval(update, 2500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [pathname]);
  return pieces;
}

/**
 * The table under the page. It drifts a little as the page scrolls, slower than the content
 * plate, so the plate reads as lying on top of it. Still when motion is reduced.
 */
function LegoMat() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mat = ref.current;
    if (!mat) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const shift = still.matches ? 0 : (window.scrollY * MAT_DRIFT) % MAT_PERIOD;
      mat.style.transform = `translate3d(0, ${(-shift).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      frame ??= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    still.addEventListener('change', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      still.removeEventListener('change', onScroll);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);

  return createPortal(
    <div ref={ref} className="lego-mat no-export" aria-hidden="true" />,
    document.body,
  );
}

function LegoBanner({
  strings,
  runtime,
  compact,
}: {
  strings: LegoStrings;
  runtime: LegoRuntime | null;
  compact: boolean;
}) {
  const t = strings.banner;
  const locale = useLocale();
  const pathname = usePathname();
  const state = useLegoState();
  const splash = useSplash(strings.splash);
  const pieces = usePieceCount(pathname);
  const [gameOpen, setGameOpen] = useState(false);
  // Any route change, browser Back included, puts the game away.
  useEffect(() => {
    setGameOpen(false);
  }, [pathname]);
  // The clue chain: home, then the dashboard, then a page that does not exist.
  const [chain, setChain] = useState<string | null>(null);
  useEffect(() => {
    try {
      setChain(sessionStorage.getItem(CHAIN_SLOT));
    } catch {
      setChain(null);
    }
  }, [pathname]);
  const prefix = locale === 'zh' ? '/zh' : '';
  const [more, setMore] = useState(false);
  const logoClicks = useRef({ count: 0, at: 0 });
  const number = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');
  const progress = Math.min(1, state.studs / TRUE_BUILDER_GOAL);
  const complete = state.found.includes('builder');
  const place = placeFor(pathname);

  const onLogo = (event: React.MouseEvent<HTMLButtonElement>) => {
    const now = performance.now();
    const clicks = logoClicks.current;
    clicks.count = now - clicks.at < 1500 ? clicks.count + 1 : 1;
    clicks.at = now;
    event.currentTarget.dataset.spin = String(clicks.count);
    if (clicks.count >= LOGO_CLICKS) {
      clicks.count = 0;
      const box = event.currentTarget.getBoundingClientRect();
      runtime?.egg('logo', { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    }
  };

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="lego-theme-banner">
      <section
        className="lego-box no-export"
        aria-label={t.label}
        data-compact={compact ? 'true' : 'false'}
        data-complete={complete ? 'true' : 'false'}
        data-more={more ? 'true' : 'false'}
      >
        {/* Where this page is set: one fixed place per part of the site. */}
        <figure className="lego-box-place" data-place={place} data-testid="lego-place">
          <img
            src={`${IMG}${PLACE_FILES[place]}`}
            alt=""
            width={960}
            height={320}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <figcaption>{t.places[place]}</figcaption>
        </figure>
        <button
          type="button"
          className="lego-box-logo"
          aria-label={t.logoHint}
          title={t.logoAlt}
          onClick={onLogo}
        >
          <img src={`${IMG}lego-logo.svg`} alt="" width={64} height={64} decoding="async" />
        </button>
        <div className="lego-box-title">
          <p className="lego-box-name">{t.setName}</p>
          {place === 'bricksburg' && !compact ? (
            <a
              className="lego-box-splash lego-clue"
              data-testid="lego-clue-home"
              href={`${prefix}/infx/inference?g_model=DeepSeek-R1-0528`}
              onClick={() => markClue('home')}
            >
              {strings.r5.clueHome}
            </a>
          ) : chain === 'home' && pathname?.includes('/infx') ? (
            <a
              className="lego-box-splash lego-clue"
              data-testid="lego-clue-piece"
              href={`${prefix}/kragle`}
              onClick={() => markClue('piece')}
            >
              {strings.r5.clueChart}
            </a>
          ) : (
            <p className="lego-box-splash" key={splash}>
              {splash}
            </p>
          )}
        </div>
        <div className="lego-box-bench">
          <div className="lego-box-tools">
            <button
              type="button"
              className="lego-tool"
              data-lego-tool="game"
              data-testid="lego-launch"
              onClick={() => {
                setGameOpen(true);
                track('lego_game_opened');
                runtime?.egg('game');
              }}
            >
              <span className="lego-tool-brick" aria-hidden="true" />
              <span>{t.play}</span>
              {/* Booklets finished in Brick Studio; the slim box shows this, the full box lists a fact. */}
              <span
                className="lego-tool-count"
                data-testid="lego-launch-built"
                data-complete={state.sets >= BOOKLETS ? 'true' : 'false'}
                title={t.builtHint}
              >
                <span aria-hidden="true">
                  {state.sets}/{BOOKLETS}
                </span>
                <span className="sr-only">{fill(t.built, { n: state.sets, total: BOOKLETS })}</span>
              </span>
            </button>
            <button
              type="button"
              className="lego-tool lego-tool-quiet"
              data-lego-tool="journal"
              data-testid="lego-journal-open"
              onClick={() => emitLegoEffect({ type: 'journal' })}
            >
              <span className="lego-tool-book" aria-hidden="true" />
              <span>{t.journal}</span>
            </button>
          </div>
          <div className="lego-mats" role="group" aria-label={t.mats} data-testid="lego-mats">
            {MAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className="lego-mat-swatch"
                data-mat={id}
                data-testid={`lego-mat-${id}`}
                aria-pressed={state.mat === id}
                aria-label={t.matNames[id]}
                title={t.matNames[id]}
                onClick={() => {
                  if (state.mat === id) return;
                  setMat(id);
                  track('lego_mat_changed', { mat: id });
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="lego-tool lego-box-more"
            data-lego-tool="more"
            data-testid="lego-box-more"
            aria-expanded={more}
            aria-controls="lego-box-drawer"
            aria-label={fill(more ? t.lessLabel : t.moreLabel, { n: number.format(state.studs) })}
            title={more ? t.less : t.more}
            onClick={() => {
              setMore((open) => !open);
              if (!more) track('lego_box_drawer_opened');
            }}
          >
            <span className="lego-more-stud" aria-hidden="true" />
            <span className="lego-more-count" aria-hidden="true">
              {number.format(state.studs)}
            </span>
            <span className="lego-more-label" aria-hidden="true">
              {more ? t.less : t.more}
            </span>
            <span className="lego-more-caret" aria-hidden="true" />
          </button>
        </div>
        {/* Everything that is not needed to read the box at a glance: set facts, the brick
            meter, the brick separator and, on a phone, the stud pill and sound switches. */}
        <div
          className="lego-box-drawer"
          id="lego-box-drawer"
          data-testid="lego-box-drawer"
          hidden={!more}
        >
          <ul className="lego-box-facts">
            <li>{t.ages}</li>
            <li>{t.setNumber}</li>
            <li title={t.piecesHint}>{fill(t.pieces, { n: number.format(pieces) })}</li>
            <li
              title={t.builtHint}
              data-testid="lego-box-built"
              data-complete={state.sets >= BOOKLETS ? 'true' : 'false'}
            >
              {fill(t.built, { n: state.sets, total: BOOKLETS })}
            </li>
          </ul>
          <div className="lego-box-progress">
            <div
              className="lego-meter"
              data-lego-meter=""
              role="progressbar"
              aria-label={t.meterLabel}
              aria-valuemin={0}
              aria-valuemax={TRUE_BUILDER_GOAL}
              aria-valuenow={Math.min(state.studs, TRUE_BUILDER_GOAL)}
              aria-valuetext={fill(t.meterValue, {
                studs: number.format(state.studs),
                goal: number.format(TRUE_BUILDER_GOAL),
              })}
              title={fill(t.meterValue, {
                studs: number.format(state.studs),
                goal: number.format(TRUE_BUILDER_GOAL),
              })}
            >
              <span
                className="lego-meter-fill"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </div>
            <p className="lego-box-secrets" data-complete={complete ? 'true' : 'false'}>
              <span className="lego-box-studs">
                {complete
                  ? t.trueBuilder
                  : fill(t.meterValue, {
                      studs: number.format(state.studs),
                      goal: number.format(TRUE_BUILDER_GOAL),
                    })}
              </span>
              <span>{fill(t.secrets, { found: state.found.length, total: FIND_IDS.length })}</span>
            </p>
          </div>
          <button
            type="button"
            className="lego-tool"
            data-lego-tool="separator"
            data-testid="lego-separator"
            aria-pressed={state.separator}
            title={t.separatorHint}
            onClick={() => runtime?.toggleSeparator()}
          >
            <img
              src={`${IMG}separator.webp`}
              alt=""
              width={141}
              height={120}
              loading="lazy"
              decoding="async"
            />
            <span>{state.separator ? t.separatorOff : t.separatorOn}</span>
          </button>
          {/* Rendered only while the drawer is open, so no postcard is fetched before that. */}
          {more ? (
            <ul
              className="lego-box-postcards"
              aria-label={t.postcards}
              data-testid="lego-postcards"
            >
              {POSTCARDS.map((card) => (
                <li key={card.id} data-here={card.id === place ? 'true' : 'false'}>
                  <img
                    src={`${IMG}${card.file}`}
                    alt=""
                    width={648}
                    height={240}
                    decoding="async"
                    draggable={false}
                  />
                  <span>{t.postcardNames[card.id]}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="lego-box-pocket">
            <LegoToggles box />
          </div>
        </div>
        <img
          className="lego-box-art lego-box-art-ship"
          src={`${IMG}spaceship.webp`}
          alt={t.shipAlt}
          width={439}
          height={300}
          loading="lazy"
          decoding="async"
        />
        <img
          className="lego-box-art"
          src={`${IMG}emmet-run.webp`}
          alt={t.artAlt}
          width={203}
          height={300}
          loading="lazy"
          decoding="async"
        />
        <img
          className="lego-box-art lego-box-art-benny"
          src={`${IMG}benny-float.webp`}
          alt=""
          width={213}
          height={260}
          loading="lazy"
          decoding="async"
        />
      </section>
      {gameOpen && (
        <LegoGameDialog
          onClose={() => {
            setGameOpen(false);
            syncBuiltSets();
            track('lego_game_closed');
          }}
        />
      )}
    </div>
  );
}

export default function LegoTheme() {
  const locale = useLocale();
  const pathname = usePathname();
  const strings = STRINGS[locale];
  const stringsRef = useRef<LegoStrings>(strings);
  stringsRef.current = strings;
  const [runtime, setRuntime] = useState<LegoRuntime | null>(null);
  const embedded = isEmbedPathname(pathname);

  useEffect(() => {
    if (embedded) return;
    const mounted = mountLegoRuntime(() => stringsRef.current);
    setRuntime(mounted);
    return () => {
      mounted.dispose();
      setRuntime(null);
    };
  }, [embedded]);

  // The chosen table mat is a sub-palette: an attribute on <html> that the stylesheet reads.
  const { mat } = useLegoState();
  useEffect(() => {
    if (embedded || mat === 'classic') return;
    const root = document.documentElement;
    root.dataset.legoMat = mat;
    return () => {
      delete root.dataset.legoMat;
    };
  }, [embedded, mat]);

  const [journalOpen, setJournalOpen] = useState(false);
  useEffect(
    () =>
      onLegoEffect((effect) => {
        if (effect.type === 'journal') setJournalOpen(true);
      }),
    [],
  );

  const home = pathname === '/' || pathname === '/zh';
  return (
    <>
      <ThemeHeaderToggles>
        <LegoToggles />
      </ThemeHeaderToggles>
      <LegoBanner strings={strings} runtime={runtime} compact={!home} />
      {!embedded && runtime && <LegoMat />}
      {!embedded && runtime && <LegoScene strings={strings} runtime={runtime} />}
      {journalOpen && <LegoJournalDialog onClose={() => setJournalOpen(false)} />}
    </>
  );
}
