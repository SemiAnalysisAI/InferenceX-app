'use client';

import { useEffect } from 'react';
import { HALO_CHANGE, haloRead } from './halo-state';

export const HALO_MUSIC_KEY = 'halo-music';
export const HALO_DUCK = 'halo-duck';
export const HALO_MUSIC_SRC = '/decorative/halo/halo-theme.mp3';
const positionKey = 'halo-music-current-time';

export function haloMusicEnabled(): boolean {
  return haloRead(HALO_MUSIC_KEY, 'true') !== 'false';
}

export function HaloMusic() {
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = 'none';
    let activated = false;
    let restored = false;
    let lastSave = 0;
    function restore() {
      try {
        const offset = Number(sessionStorage.getItem(positionKey));
        if (
          Number.isFinite(offset) &&
          offset > 0 &&
          Number.isFinite(audio.duration) &&
          audio.duration > 0
        ) {
          audio.currentTime = offset % audio.duration;
        }
      } catch {}
      restored = true;
    }
    function save() {
      if (!restored || !Number.isFinite(audio.currentTime)) return;
      try {
        sessionStorage.setItem(positionKey, String(audio.currentTime));
      } catch {}
    }
    function onTimeUpdate() {
      const now = performance.now();
      if (now - lastSave >= 2_000) {
        lastSave = now;
        save();
      }
    }

    const removeGesture = () => window.removeEventListener('click', onGesture);
    function onGesture(event: Event) {
      if (!event.isTrusted) return;
      removeGesture();
      activated = true;
      sync();
    }

    function sync() {
      if (!activated || !haloMusicEnabled()) {
        audio.pause();
        return;
      }
      if (!audio.hasAttribute('src')) audio.src = HALO_MUSIC_SRC;
      if (audio.paused) void audio.play().catch(() => {});
    }
    const duck = (event: Event) => {
      audio.volume = (event as CustomEvent<boolean>).detail ? 0.12 : 0.35;
    };

    audio.addEventListener('loadedmetadata', restore, { once: true });
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('pause', save);
    window.addEventListener('pagehide', save);
    window.addEventListener('click', onGesture);
    window.addEventListener(HALO_CHANGE, sync);
    window.addEventListener(HALO_DUCK, duck);
    return () => {
      activated = false;
      save();
      audio.removeEventListener('loadedmetadata', restore);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('pause', save);
      window.removeEventListener('pagehide', save);
      removeGesture();
      window.removeEventListener(HALO_CHANGE, sync);
      window.removeEventListener(HALO_DUCK, duck);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return null;
}
