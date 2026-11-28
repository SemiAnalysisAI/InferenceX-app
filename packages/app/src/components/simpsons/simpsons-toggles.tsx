'use client';

import { useEffect, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { enabled, isMuted, muteAll, setEnabled, type Channel } from './audio';
import { STRINGS } from './strings';

function toggle(channel: Channel) {
  const next = !enabled(channel);
  setEnabled(channel, next);
  track(`simpsons_${channel}_toggled`, { enabled: next });
}

export default function SimpsonsToggles() {
  const locale = useLocale(),
    t = STRINGS[locale];
  const [muted, setMuted] = useState(false);
  const [on, setOn] = useState({ music: true, sound: true });
  useEffect(() => {
    const sync = () => {
      setMuted(isMuted());
      setOn({ music: enabled('music'), sound: enabled('sound') });
    };
    sync();
    window.addEventListener('simpsons-music-toggle', sync);
    window.addEventListener('simpsons-sound-toggle', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('simpsons-music-toggle', sync);
      window.removeEventListener('simpsons-sound-toggle', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return (
    <>
      <button
        type="button"
        data-simpsons-control=""
        className="simpsons-dial sp-master-mute"
        aria-pressed={muted}
        aria-label={locale === 'zh' ? '全部静音' : 'Mute all audio'}
        title={locale === 'zh' ? '全部静音' : 'Mute all audio'}
        onClick={() => muteAll(!isMuted())}
      >
        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      {(['music', 'sound'] as const).map((channel) => {
        const label = channel === 'music' ? t.music : t.effects;
        const Icon = channel === 'music' ? Music2 : on.sound ? Volume2 : VolumeX;
        return (
          <button
            key={channel}
            data-simpsons-control=""
            type="button"
            disabled={muted}
            className="simpsons-dial"
            onClick={() => toggle(channel)}
            aria-pressed={on[channel]}
            title={label}
            aria-label={label}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </>
  );
}
