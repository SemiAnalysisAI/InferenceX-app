'use client';

import { useEffect, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import {
  GHIBLI_MUSIC_EVENT,
  GHIBLI_MUSIC_KEY,
  GHIBLI_SOUND_EVENT,
  GHIBLI_SOUND_KEY,
  ghibliMusicEnabled,
  ghibliSoundEnabled,
  writeGhibliFlag,
} from './ghibli-prefs';

const toggleClasses = cn(
  'ghibli-toggle inline-flex items-center justify-center rounded-full size-11',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

const STRINGS = {
  en: {
    soundOff: 'Mute Ghibli sound effects',
    soundOn: 'Play Ghibli sound effects',
    musicOff: "Stop Joe Hisaishi's One Summer's Day",
    musicOn: "Play Joe Hisaishi's One Summer's Day",
  },
  zh: {
    soundOff: '关闭吉卜力音效',
    soundOn: '开启吉卜力音效',
    musicOff: '停止久石让《那个夏天》',
    musicOn: '播放久石让《那个夏天》',
  },
} as const;

/**
 * `variant` changes only the test ids, so the toggles can also sit in the banner (small
 * screens) and the game dialog without duplicating the header's ids.
 */
export default function GhibliToggles({ variant }: { variant?: 'banner' | 'game' } = {}) {
  const suffix = variant ? `-${variant}` : '';
  const t = STRINGS[useLocale()];
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  useEffect(() => {
    const check = () => {
      setSoundOn(ghibliSoundEnabled());
      setMusicOn(ghibliMusicEnabled());
    };
    check();
    window.addEventListener(GHIBLI_SOUND_EVENT, check);
    window.addEventListener(GHIBLI_MUSIC_EVENT, check);
    return () => {
      window.removeEventListener(GHIBLI_SOUND_EVENT, check);
      window.removeEventListener(GHIBLI_MUSIC_EVENT, check);
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeGhibliFlag(GHIBLI_SOUND_KEY, next);
    window.dispatchEvent(new CustomEvent(GHIBLI_SOUND_EVENT));
    track('ghibli_sound_toggled', { enabled: next });
  }

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    writeGhibliFlag(GHIBLI_MUSIC_KEY, next);
    window.dispatchEvent(new CustomEvent(GHIBLI_MUSIC_EVENT));
    track('ghibli_music_toggled', { enabled: next });
  }

  const soundLabel = soundOn ? t.soundOff : t.soundOn;
  const musicLabel = musicOn ? t.musicOff : t.musicOn;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        data-testid={`ghibli-sound-toggle${suffix}`}
        className={toggleClasses}
        onClick={toggleSound}
        title={soundLabel}
        aria-label={soundLabel}
        aria-pressed={soundOn}
      >
        {soundOn ? (
          <Volume2 className="w-[20px] h-[20px]" aria-hidden="true" />
        ) : (
          <VolumeX className="w-[20px] h-[20px]" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        data-testid={`ghibli-music-toggle${suffix}`}
        className={toggleClasses}
        onClick={toggleMusic}
        title={musicLabel}
        aria-label={musicLabel}
        aria-pressed={musicOn}
      >
        <span className="relative">
          <Music className="w-[20px] h-[20px]" aria-hidden="true" />
          {!musicOn && (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="block w-[22px] h-[2px] bg-current rotate-45" />
            </span>
          )}
        </span>
      </button>
    </span>
  );
}
