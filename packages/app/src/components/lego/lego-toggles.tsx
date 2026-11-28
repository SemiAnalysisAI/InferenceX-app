'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Music, Volume2, VolumeOff } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import {
  SECRET_FIGURES,
  FIND_IDS,
  type SecretId,
  emitLegoEffect,
  getLegoState,
  getServerLegoState,
  setMusicEnabled,
  setSoundEnabled,
  subscribeLego,
  syncLegoPreferences,
} from './lego-store';
import { STRINGS, fill } from './lego-strings';

/** Secrets whose figure is a minifigure with a head: these can be the player icon. */
const FACES: ReadonlySet<SecretId> = new Set([
  'konami',
  'awesome',
  'spaceship',
  'kragle',
  'pants',
  'toy',
  'logo',
  'idle',
  'separator',
  'shatter',
  'game',
  'builder',
  'yoda',
  'batman',
]);

const toggleClasses = cn(
  'lego-toggle inline-flex items-center justify-center rounded-md size-11',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

/**
 * Header controls for the LEGO theme: the stud counter (which opens the set instructions),
 * the music toggle and the sound toggle.
 */
/** `box` is the copy in the box drawer; its test ids carry that so each one stays unique. */
export default function LegoToggles({ box = false }: { box?: boolean }) {
  const locale = useLocale();
  const t = STRINGS[locale].toggles;
  const state = useSyncExternalStore(subscribeLego, getLegoState, getServerLegoState);

  useEffect(() => {
    // Another tab or the other header copy may have flipped a preference.
    window.addEventListener('lego-sound-toggle', syncLegoPreferences);
    window.addEventListener('lego-music-toggle', syncLegoPreferences);
    return () => {
      window.removeEventListener('lego-sound-toggle', syncLegoPreferences);
      window.removeEventListener('lego-music-toggle', syncLegoPreferences);
    };
  }, []);

  function toggleMusic() {
    const next = !state.music;
    try {
      localStorage.setItem('lego-music', String(next));
    } catch {
      // Storage may be blocked; the in-memory preference still changes.
    }
    setMusicEnabled(next);
    track('lego_music_toggled', { enabled: next });
  }

  function toggleSound() {
    const next = !state.sound;
    try {
      localStorage.setItem('lego-sound', String(next));
    } catch {
      // Storage may be blocked; the in-memory preference still changes.
    }
    setSoundEnabled(next);
    track('lego_sound_toggled', { enabled: next });
  }

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const studs = new Intl.NumberFormat(tag).format(state.studs);
  const short = new Intl.NumberFormat(tag, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(state.studs);
  const journalLabel = fill(t.journal, {
    n: studs,
    found: state.found.length,
    total: FIND_IDS.length,
  });
  // The player icon of the LEGO video games: the last minifigure found, Emmet until then.
  const face = state.found.findLast((id) => FACES.has(id)) ?? 'awesome';
  const musicLabel = state.music ? t.muteMusic : t.unmuteMusic;
  const soundLabel = state.sound ? t.muteSound : t.unmuteSound;

  return (
    <>
      <button
        type="button"
        className="lego-stud-counter"
        data-lego-stud-counter=""
        data-testid={box ? 'lego-box-stud-counter' : 'lego-stud-counter'}
        data-complete={state.found.includes('builder') ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-label={journalLabel}
        title={journalLabel}
        onClick={() => {
          emitLegoEffect({ type: 'journal' });
          track('lego_journal_opened');
        }}
      >
        <span
          className="lego-hud-face"
          data-face={face}
          aria-hidden="true"
          style={{
            backgroundImage: `url(/decorative/lego/img/${SECRET_FIGURES[face].file})`,
          }}
        />
        <span className="lego-stud-icon" aria-hidden="true" />
        <span className="lego-stud-count" key={state.studs}>
          <span className="lego-stud-count-full">{studs}</span>
          <span className="lego-stud-count-short" aria-hidden="true">
            {short}
          </span>
        </span>
        <span className="lego-stud-found" aria-hidden="true">
          {state.found.length}/{FIND_IDS.length}
        </span>
      </button>
      <button
        type="button"
        className={toggleClasses}
        data-testid={box ? 'lego-box-music-toggle' : 'lego-music-toggle'}
        onClick={toggleMusic}
        title={musicLabel}
        aria-label={musicLabel}
        aria-pressed={state.music}
      >
        <span className="relative">
          <Music className="size-5" />
          {!state.music && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="block h-0.5 w-6 rotate-45 bg-current" />
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={toggleClasses}
        data-testid={box ? 'lego-box-sound-toggle' : 'lego-sound-toggle'}
        onClick={toggleSound}
        title={soundLabel}
        aria-label={soundLabel}
        aria-pressed={state.sound}
      >
        {state.sound ? <Volume2 className="size-5" /> : <VolumeOff className="size-5" />}
      </button>
    </>
  );
}
