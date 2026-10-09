'use client';

import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { HALO_MUSIC_EVENT, HALO_MUSIC_KEY, haloMusicEnabled } from './halo-music';

const toggleClasses = cn(
  'inline-flex items-center justify-center rounded-md size-11',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

const STRINGS = {
  en: { mute: 'Mute Halo music', unmute: 'Play Halo music' },
  zh: { mute: '关闭 Halo 音乐', unmute: '播放 Halo 音乐' },
} as const;

/** Header music toggle, rendered only by the Halo-gated lazy wrapper. */
export function HaloToggles() {
  const t = STRINGS[useLocale()];
  const [musicOn, setMusicOn] = useState(true);

  useEffect(() => {
    const check = () => setMusicOn(haloMusicEnabled());
    check();
    window.addEventListener(HALO_MUSIC_EVENT, check);
    return () => window.removeEventListener(HALO_MUSIC_EVENT, check);
  }, []);

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    try {
      localStorage.setItem(HALO_MUSIC_KEY, String(next));
    } catch {
      // Private mode: the toggle still applies to this page view.
    }
    window.dispatchEvent(new CustomEvent(HALO_MUSIC_EVENT));
    track('halo_music_toggled', { enabled: next });
  }

  const label = musicOn ? t.mute : t.unmute;
  return (
    <button
      type="button"
      data-testid="halo-music-toggle"
      className={toggleClasses}
      onClick={toggleMusic}
      title={label}
      aria-label={label}
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
  );
}
