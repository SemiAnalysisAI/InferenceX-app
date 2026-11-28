'use client';

import { useEffect, useState } from 'react';
import { Music, Volume2, VolumeOff } from 'lucide-react';

import { cn } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';

import { csgoCopy } from './csgo-strings';
import { musicOn as readMusic, setMusicOn, setSoundOn, soundOn as readSound } from './csgo-store';

const toggleClasses = cn(
  'inline-flex size-11 items-center justify-center',
  'text-muted-foreground hover:text-foreground',
  'focus-visible:outline-none',
);

export function CsgoToggles({ placement = 'header' }: { placement?: 'header' | 'banner' }) {
  const copy = csgoCopy(useLocale());
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);

  useEffect(() => {
    setSound(readSound());
    setMusic(readMusic());
  }, []);

  const soundLabel = sound ? `${copy.sound}` : `${copy.sound}`;
  return (
    <span className={placement === 'banner' ? 'csgo-banner-audio' : 'contents'} data-csgo-silent>
      <button
        type="button"
        className={toggleClasses}
        aria-pressed={music}
        aria-label={copy.music}
        title={copy.music}
        onClick={() => {
          const next = !music;
          setMusic(next);
          setMusicOn(next);
        }}
      >
        <span className="relative">
          <Music className="size-5" />
          {!music && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="block h-0.5 w-5 rotate-45 bg-current" />
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={toggleClasses}
        aria-pressed={sound}
        aria-label={soundLabel}
        title={copy.sound}
        onClick={() => {
          const next = !sound;
          setSound(next);
          setSoundOn(next);
        }}
      >
        {sound ? <Volume2 className="size-5" /> : <VolumeOff className="size-5" />}
      </button>
    </span>
  );
}
