'use client';

import { useEffect } from 'react';

export const HALO_MUSIC_KEY = 'halo-music';
export const HALO_MUSIC_EVENT = 'halo-music-toggle';
export const HALO_MUSIC_SRC = '/decorative/halo/halo-theme.mp3';

/** Music defaults on; only an explicit `false` mutes it. */
export function haloMusicEnabled(): boolean {
  try {
    return localStorage.getItem(HALO_MUSIC_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Loops the Halo: Combat Evolved title theme while the Halo theme is mounted.
 * Browsers block autoplay without a gesture, so a blocked start waits for the
 * next pointer or key press. Unmounting (leaving the theme) stops playback.
 */
export function HaloMusic() {
  useEffect(() => {
    const audio = new Audio(HALO_MUSIC_SRC);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = 'auto';
    let disposed = false;

    const gestureEvents = ['pointerdown', 'keydown'] as const;
    const removeGesture = () =>
      gestureEvents.forEach((type) => window.removeEventListener(type, onGesture, true));
    function onGesture() {
      removeGesture();
      if (!disposed && haloMusicEnabled()) void audio.play().catch(() => {});
    }

    function sync() {
      if (!haloMusicEnabled()) {
        removeGesture();
        audio.pause();
        return;
      }
      audio.play().catch(() => {
        if (disposed) return;
        gestureEvents.forEach((type) => window.addEventListener(type, onGesture, true));
      });
    }

    sync();
    window.addEventListener(HALO_MUSIC_EVENT, sync);
    return () => {
      disposed = true;
      removeGesture();
      window.removeEventListener(HALO_MUSIC_EVENT, sync);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return null;
}
