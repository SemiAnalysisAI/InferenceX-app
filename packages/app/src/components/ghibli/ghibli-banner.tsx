'use client';

import { useEffect, useState, type Ref } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  CHAPTER_IDS,
  formatTokens,
  goldCount,
  medalCount,
  useBoilerSave,
} from './ghibli-boiler-store';
import {
  GHIBLI_FILMS,
  asset,
  prefersReducedMotion,
  useGhibliLantern,
  writeGhibliLantern,
  type GhibliFilm,
} from './ghibli-prefs';
import { STAMPS, STAMP_STILLS, stampPassport, usePassport } from './ghibli-passport';
import { STRINGS } from './ghibli-strings';
import GhibliToggles from './ghibli-toggles';

function fillIn(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(/\{(?<key>\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** A paper lantern that switches the theme to its evening palette. */
function LanternToggle() {
  const t = STRINGS[useLocale()];
  const lit = useGhibliLantern();
  return (
    <button
      type="button"
      className="ghibli-lantern-toggle"
      data-testid="ghibli-lantern-toggle"
      aria-pressed={lit}
      aria-label={t.lanternLabel}
      title={t.lanternLabel}
      onClick={() => {
        writeGhibliLantern(!lit);
        track('ghibli_lantern_toggled', { enabled: !lit });
      }}
    >
      <span className="ghibli-lantern-icon" aria-hidden="true" />
      <span className="ghibli-lantern-name">{t.lantern}</span>
    </button>
  );
}

/** The wooden bath tag that opens the boiler game, with the player's medals pinned to it. */
function BoilerLaunch({
  onPlay,
  launchRef,
}: {
  onPlay: () => void;
  launchRef?: Ref<HTMLButtonElement>;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const save = useBoilerSave();
  const medals = medalCount(save);
  const best = Math.max(save.endlessBest, ...Object.values(save.chapterBest));
  const golds = goldCount(save);
  const badge =
    medals || best
      ? fillIn(t.boilerBadge, { m: medals, b: formatTokens(best, locale) })
      : t.boilerFresh;
  return (
    <button
      ref={launchRef}
      type="button"
      className="ghibli-boiler-launch"
      data-testid="ghibli-boiler-launch"
      aria-label={`${t.boilerLabel}. ${badge}${golds ? `, ${fillIn(t.boilerGold, { g: golds })}` : ''}`}
      onClick={onPlay}
    >
      <span className="ghibli-boiler-launch-knot" aria-hidden="true" />
      <span className="ghibli-boiler-launch-name">{t.boilerLaunch}</span>
      <span className="ghibli-boiler-launch-badge" data-testid="ghibli-boiler-badge">
        {badge}
      </span>
      <span className="ghibli-boiler-launch-medals" aria-hidden="true">
        {CHAPTER_IDS.map((id) => (
          <span key={id} data-medal={save.medals[id] ?? 0} />
        ))}
      </span>
    </button>
  );
}

/** Eight stamp slots; each filled slot shows its film's still. A cleared boiler shift stamps one. */
function Passport() {
  const t = STRINGS[useLocale()];
  const stamps = usePassport();
  const save = useBoilerSave();
  const cleared = medalCount(save) > 0;
  useEffect(() => {
    if (cleared) stampPassport('boiler');
  }, [cleared]);
  const count = stamps.length;
  return (
    <div
      className="ghibli-passport"
      data-testid="ghibli-passport"
      data-count={count}
      data-full={count === STAMPS.length ? 'true' : undefined}
    >
      <p className="ghibli-passport-label">
        <span>{t.passport}</span>
        <span className="ghibli-passport-count">{fillIn(t.passportCount, { n: count })}</span>
      </p>
      <ul className="ghibli-passport-stamps">
        {STAMPS.map((id) => {
          const have = stamps.includes(id);
          return (
            <li
              key={id}
              data-stamp={id}
              data-have={have ? 'true' : undefined}
              title={have ? t.stamps[id] : undefined}
            >
              {have ? (
                <img src={asset(`stills/${STAMP_STILLS[id]}.webp`)} alt={t.stamps[id]} />
              ) : (
                <span className="sr-only">?</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const FILM_STILLS: Record<GhibliFilm, string> = {
  spirited: 'stills/still-chihiro043.webp',
  heron: 'stills/still-kimitachi044.webp',
  howl: 'stills/still-howl048.webp',
  mononoke: 'stills/still-mononoke010.webp',
  ponyo: 'stills/still-ponyo005.webp',
};

/** Wide crops of official stills with the film's lead large in frame: the banner backdrop. */
export const FILM_BACKDROPS: Record<GhibliFilm, string> = {
  spirited: 'stills/banner-spirited.webp',
  heron: 'stills/banner-heron.webp',
  howl: 'stills/banner-howl.webp',
  mononoke: 'stills/banner-mononoke.webp',
  ponyo: 'stills/banner-ponyo.webp',
};

const FILM_CHIP_SPRITES: Record<GhibliFilm, string> = {
  spirited: 'sprites/noface-peek.webp',
  heron: 'sprites/heron-head.webp',
  howl: 'sprites/calcifer.webp',
  mononoke: 'sprites/kodama-1.webp',
  ponyo: 'sprites/ponyo-jelly.webp',
};

const LINE_INTERVAL_MS = 12_000;
const OPENING_KEY = 'ghibli-opening-seen';
const OPENING_MS = 2800;

/**
 * The studio's blue opening card, shown once per session inside the polaroid before the film
 * still. It never covers the page: it is the polaroid picture itself.
 */
function useOpeningCard(): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPENING_KEY) === '1') return;
    } catch {
      return;
    }
    setShowing(true);
    const id = window.setTimeout(() => {
      setShowing(false);
      try {
        sessionStorage.setItem(OPENING_KEY, '1');
      } catch {}
    }, OPENING_MS);
    return () => window.clearTimeout(id);
  }, []);
  return showing;
}

export function GhibliBanner({
  film,
  onFilm,
  onPlay,
  launchRef,
}: {
  film: GhibliFilm;
  onFilm: (film: GhibliFilm) => void;
  onPlay: () => void;
  launchRef?: Ref<HTMLButtonElement>;
}) {
  const t = STRINGS[useLocale()];
  const pathname = usePathname();
  // Away from the dashboard home the banner folds into one slim row.
  const compact = pathname !== '/' && pathname !== '/zh' && pathname !== null;
  const [line, setLine] = useState(0);
  const [paused, setPaused] = useState(false);
  const opening = useOpeningCard();

  useEffect(() => {
    setLine(Math.floor(Math.random() * t.lines.length));
  }, [t.lines.length]);

  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const id = window.setInterval(
      () => setLine((value) => (value + 1) % t.lines.length),
      LINE_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [paused, t.lines.length]);

  const filmCopy = t.films[film];

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="ghibli-theme-banner">
      <section
        className="ghibli-theme-banner"
        data-compact={compact ? 'true' : undefined}
        data-film={film}
        aria-labelledby="ghibli-banner-title"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="ghibli-banner-wash">
          <img
            src={asset(FILM_BACKDROPS[film])}
            alt={filmCopy.backdrop}
            width={1920}
            height={720}
            decoding="async"
          />
        </div>
        <p className="ghibli-banner-credit">
          <span>{filmCopy.name}</span>
          <span>{t.stillCredit}</span>
        </p>
        <div className="ghibli-banner-copy">
          <div className="ghibli-banner-heading">
            <img
              className="ghibli-totoro-nod"
              src={asset('sprites/totoro-nod.webp')}
              alt={t.totoro}
              title={t.totoro}
              width={40}
              height={45}
              decoding="async"
            />
            <div className="min-w-0">
              {/* Not a heading: decorative chrome must leave the page's heading outline alone. */}
              <p id="ghibli-banner-title" className="ghibli-banner-title">
                {t.title}
              </p>
              <p className="ghibli-banner-subtitle">{t.subtitle}</p>
            </div>
            <span className="ghibli-banner-toggles" role="group" aria-label={t.soundLabel}>
              <GhibliToggles variant="banner" />
            </span>
          </div>
          <button
            type="button"
            className="ghibli-banner-line"
            onClick={() => setLine((value) => (value + 1) % t.lines.length)}
            title={t.nextLine}
          >
            <span className="sr-only">{t.nextLine}: </span>
            <span key={line} className="ghibli-banner-line-text">
              {t.lines[line]}
            </span>
          </button>
          <div className="ghibli-film-chips" role="group" aria-label={t.filmsLabel}>
            {GHIBLI_FILMS.map((id) => (
              <button
                key={id}
                type="button"
                className="ghibli-film-chip"
                data-film={id}
                aria-pressed={film === id}
                onClick={() => {
                  if (id !== film) track('ghibli_film_selected', { film: id });
                  onFilm(id);
                }}
              >
                <img src={asset(FILM_CHIP_SPRITES[id])} alt="" aria-hidden="true" />
                <span className="ghibli-film-chip-name">{t.films[id].name}</span>
                <span className="ghibli-film-chip-year">{t.films[id].year}</span>
              </button>
            ))}
          </div>
          <div className="ghibli-banner-actions">
            <BoilerLaunch onPlay={onPlay} launchRef={launchRef} />
            <LanternToggle />
            <Passport />
          </div>
        </div>
        <figure className="ghibli-polaroid" data-opening={opening ? 'true' : undefined}>
          <span className="ghibli-polaroid-frame">
            <img
              src={asset(FILM_STILLS[film])}
              alt={filmCopy.still}
              width={320}
              height={173}
              decoding="async"
            />
            <span className="ghibli-opening-card" aria-hidden="true">
              <img src={asset('sprites/ghibli-logo-card.webp')} alt="" width={600} height={496} />
            </span>
          </span>
          <figcaption>
            <span>{filmCopy.name}</span>
            <span className="ghibli-polaroid-credit">{t.stillCredit}</span>
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
