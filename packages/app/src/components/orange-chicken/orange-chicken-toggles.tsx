'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Music, Volume2, VolumeOff } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { toggleOcMusic, toggleOcSound } from './orange-chicken-audio';
import { foodDataUri } from './orange-chicken-art';
import {
  SECRET_IDS,
  emitOcEffect,
  getOcState,
  getServerOcState,
  subscribeOc,
  syncOcPreferences,
} from './orange-chicken-store';
import { STRINGS, fill } from './orange-chicken-strings';

const toggleClasses = cn(
  'oc-toggle inline-flex items-center justify-center rounded-md size-11',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

const CHICKEN = foodDataUri('chicken');

/** Header controls: the orders-served counter (opens the journal), music and sound toggles. */
function toggleMusic() {
  track('orange_chicken_music_toggled', { enabled: toggleOcMusic() });
}

function toggleSound() {
  track('orange_chicken_sound_toggled', { enabled: toggleOcSound() });
}

export default function OrangeChickenToggles() {
  const locale = useLocale();
  const t = STRINGS[locale].toggles;
  const state = useSyncExternalStore(subscribeOc, getOcState, getServerOcState);

  useEffect(() => {
    // Another tab may have flipped a preference.
    window.addEventListener('storage', syncOcPreferences);
    return () => window.removeEventListener('storage', syncOcPreferences);
  }, []);

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const orders = new Intl.NumberFormat(tag).format(state.save.orders);
  const label = fill(t.journal, {
    n: orders,
    found: state.found.length,
    total: SECRET_IDS.length,
  });
  const musicLabel = state.music ? t.muteMusic : t.unmuteMusic;
  const soundLabel = state.sound ? t.muteSound : t.unmuteSound;

  return (
    <>
      <button
        type="button"
        className="oc-counter-chip"
        data-testid="orange-chicken-counter"
        data-complete={state.found.length >= SECRET_IDS.length ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        onClick={() => {
          emitOcEffect({ type: 'journal' });
          track('orange_chicken_journal_opened');
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CHICKEN} alt="" aria-hidden="true" />
        <span>{orders}</span>
        <span className="oc-counter-found" aria-hidden="true">
          {state.found.length}/{SECRET_IDS.length}
        </span>
      </button>
      <button
        type="button"
        className={toggleClasses}
        data-testid="orange-chicken-music-toggle"
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
        data-testid="orange-chicken-sound-toggle"
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
