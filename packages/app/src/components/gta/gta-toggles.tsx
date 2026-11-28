'use client';

import { useSyncExternalStore } from 'react';
import { Radio, Volume2, VolumeOff } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  FIND_IDS,
  emitGtaEffect,
  getGtaState,
  getServerGtaState,
  setMusicEnabled,
  setSoundEnabled,
  subscribeGta,
} from './gta-store';
import { STRINGS, fill } from './gta-strings';

/**
 * Header controls for the GTA theme: the cash counter (which opens the phone), the radio
 * toggle and the interface sound toggle. Rendered into both header toggle slots.
 */
export default function GtaToggles() {
  const locale = useLocale();
  const t = STRINGS[locale].toggles;
  const state = useSyncExternalStore(subscribeGta, getGtaState, getServerGtaState);
  const cash = `$${new Intl.NumberFormat('en-US').format(state.cash)}`;
  const short = `$${new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(state.cash)}`;
  const phoneLabel = fill(t.phone, {
    cash,
    found: state.found.length,
    total: FIND_IDS.length,
  });
  const musicLabel = state.music ? t.muteMusic : t.unmuteMusic;
  const soundLabel = state.sound ? t.muteSound : t.unmuteSound;

  return (
    <>
      <button
        type="button"
        className="gta-cash-pill"
        data-testid="gta-cash-pill"
        aria-haspopup="dialog"
        aria-label={phoneLabel}
        title={phoneLabel}
        onClick={() => emitGtaEffect({ type: 'phone' })}
      >
        <span className="gta-cash-value" key={state.cash}>
          <span className="gta-cash-full">{cash}</span>
          <span className="gta-cash-short" aria-hidden="true">
            {short}
          </span>
        </span>
        <span className="gta-cash-found" aria-hidden="true">
          {state.found.length}/{FIND_IDS.length}
        </span>
      </button>
      <button
        type="button"
        className="gta-toggle"
        data-testid="gta-music-toggle"
        data-off={state.music ? undefined : 'true'}
        onClick={() => {
          setMusicEnabled(!state.music);
          track('gta_music_toggled', { enabled: !state.music });
        }}
        title={musicLabel}
        aria-label={musicLabel}
        aria-pressed={state.music}
      >
        <Radio className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="gta-toggle"
        data-testid="gta-sound-toggle"
        data-off={state.sound ? undefined : 'true'}
        onClick={() => {
          setSoundEnabled(!state.sound);
          track('gta_sound_toggled', { enabled: !state.sound });
        }}
        title={soundLabel}
        aria-label={soundLabel}
        aria-pressed={state.sound}
      >
        {state.sound ? (
          <Volume2 className="size-5" aria-hidden="true" />
        ) : (
          <VolumeOff className="size-5" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
