'use client';

import { useEffect, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { STRINGS } from './strings';
import { enabled, setEnabled, type Channel } from './preferences';

export default function SouthParkToggles({
  compact = false,
  room = false,
}: { compact?: boolean; room?: boolean } = {}) {
  const t = STRINGS[useLocale()];
  const [prefs, setPrefs] = useState({ sound: true, music: true });
  useEffect(() => {
    const sync = () => setPrefs({ sound: enabled('sound'), music: enabled('music') });
    sync();
    window.addEventListener('south-park-sound-toggle', sync);
    return () => window.removeEventListener('south-park-sound-toggle', sync);
  }, []);
  function toggle(key: Channel) {
    const next = !prefs[key];
    setEnabled(key, next);
    setPrefs({ ...prefs, [key]: next });
    window.dispatchEvent(
      new CustomEvent('south-park-sound-toggle', { detail: { key, enabled: next } }),
    );
    track(key === 'sound' ? 'south_park_sound_toggled' : 'south_park_music_toggled', {
      enabled: next,
    });
  }
  return (['sound', 'music'] as const)
    .filter((key) => !room || key === 'sound')
    .map((key) => {
      const Icon = key === 'sound' ? (prefs.sound ? Volume2 : VolumeX) : Music2;
      const label = t[key][Number(prefs[key])];
      return (
        <button
          type="button"
          key={key}
          disabled={key === 'music' && !prefs.sound}
          onClick={() => toggle(key)}
          data-testid={`south-park-${room ? 'room-' : compact ? 'compact-' : ''}${key}-toggle`}
          aria-pressed={prefs[key]}
          aria-label={label}
          title={label}
          className="sp-radio"
        >
          <Icon aria-hidden="true" size={17} />
        </button>
      );
    });
}
