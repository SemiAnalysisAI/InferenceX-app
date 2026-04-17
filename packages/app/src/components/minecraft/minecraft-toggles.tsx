'use client';

import { useState, useEffect } from 'react';
import { Music, Volume2, VolumeOff } from 'lucide-react';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const toggleClasses = cn(
  'inline-flex items-center justify-center rounded-md p-2',
  'text-muted-foreground hover:text-foreground hover:bg-accent',
  'transition-colors duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
);

/**
 * Header toggles for Minecraft audio. The click-sound toggle renders in every
 * theme (the click sound plays everywhere); the music toggle is minecraft-only.
 */
export function MinecraftToggles() {
  const [isMinecraft, setIsMinecraft] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    function checkTheme() {
      setIsMinecraft(document.documentElement.classList.contains('minecraft'));
    }
    function checkMusic() {
      setMusicOn(localStorage.getItem('minecraft-music') !== 'false');
    }
    function checkSound() {
      setSoundOn(localStorage.getItem('minecraft-sound') !== 'false');
    }
    checkTheme();
    checkMusic();
    checkSound();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('minecraft-music-toggle', checkMusic);
    window.addEventListener('minecraft-sound-toggle', checkSound);
    return () => {
      observer.disconnect();
      window.removeEventListener('minecraft-music-toggle', checkMusic);
      window.removeEventListener('minecraft-sound-toggle', checkSound);
    };
  }, []);

  function toggleMusic() {
    const next = !musicOn;
    setMusicOn(next);
    localStorage.setItem('minecraft-music', String(next));
    window.dispatchEvent(new CustomEvent('minecraft-music-toggle'));
    track('minecraft_music_toggled', { enabled: next });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('minecraft-sound', String(next));
    window.dispatchEvent(new CustomEvent('minecraft-sound-toggle'));
    track('minecraft_sound_toggled', { enabled: next });
  }

  return (
    <>
      {isMinecraft && (
        <button
          type="button"
          className={toggleClasses}
          onClick={toggleMusic}
          title={musicOn ? 'Mute music' : 'Unmute music'}
          aria-label={musicOn ? 'Mute music' : 'Unmute music'}
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
      )}
      <button
        type="button"
        className={toggleClasses}
        onClick={toggleSound}
        title={soundOn ? 'Mute click sounds' : 'Unmute click sounds'}
        aria-label={soundOn ? 'Mute click sounds' : 'Unmute click sounds'}
      >
        {soundOn ? (
          <Volume2 className="w-[20px] h-[20px]" />
        ) : (
          <VolumeOff className="w-[20px] h-[20px]" />
        )}
      </button>
    </>
  );
}
