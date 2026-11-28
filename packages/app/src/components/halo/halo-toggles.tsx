'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { HALO_MUSIC_KEY } from './halo-music';
import { haloWrite, useHaloValue } from './halo-state';

const toggleClasses = cn(
  'inline-flex items-center justify-center rounded-md size-11',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none',
);

const MUTE_LABEL = { en: 'Mute Halo audio', zh: '静音光环音频' } as const;

export function HaloToggles() {
  const locale = useLocale();
  const musicOn = useHaloValue(HALO_MUSIC_KEY, 'true') !== 'false';

  function toggleMusic() {
    const next = !musicOn;
    haloWrite(HALO_MUSIC_KEY, String(next));
    track('halo_music_toggled', { enabled: next });
  }

  const label = MUTE_LABEL[locale];
  return (
    <span className="halo-audio-switches">
      <button
        type="button"
        data-testid="halo-music-toggle"
        className={toggleClasses}
        onClick={toggleMusic}
        title={label}
        aria-label={label}
        aria-pressed={!musicOn}
      >
        {musicOn ? (
          <Volume2 size={18} aria-hidden="true" />
        ) : (
          <VolumeX size={18} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
