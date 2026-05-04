'use client';

import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const toggleClasses = cn(
  'inline-flex items-center justify-center rounded-md p-2',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

/** Header music toggle for the rick-morty theme — only renders when the
 * theme is active. Mirrors `MinecraftToggles` but ships only the music
 * button (no click-sound counterpart). */
export function RickMortyToggles() {
  const [isRickMorty, setIsRickMorty] = useState(false);
  const [musicOn, setMusicOn] = useState(true);

  useEffect(() => {
    function checkTheme() {
      setIsRickMorty(document.documentElement.classList.contains('rick-morty'));
    }
    function checkMusic() {
      setMusicOn(localStorage.getItem('rick-morty-music') !== 'false');
    }
    checkTheme();
    checkMusic();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('rick-morty-music-toggle', checkMusic);
    return () => {
      observer.disconnect();
      window.removeEventListener('rick-morty-music-toggle', checkMusic);
    };
  }, []);

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    localStorage.setItem('rick-morty-music', String(next));
    window.dispatchEvent(new CustomEvent('rick-morty-music-toggle'));
    track('rick_morty_music_toggled', { enabled: next });
  }

  if (!isRickMorty) return null;

  return (
    <button
      type="button"
      className={toggleClasses}
      onClick={toggleMusic}
      title={musicOn ? 'Mute intro song' : 'Unmute intro song'}
      aria-label={musicOn ? 'Mute intro song' : 'Unmute intro song'}
    >
      <span className="relative">
        <Music className="w-[20px] h-[20px]" />
        {!musicOn && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="block w-[22px] h-[2px] bg-current rotate-45" />
          </span>
        )}
      </span>
    </button>
  );
}
