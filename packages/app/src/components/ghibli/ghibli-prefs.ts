'use client';

import { useSyncExternalStore } from 'react';

export const GHIBLI_SOUND_KEY = 'ghibli-sound';
export const GHIBLI_MUSIC_KEY = 'ghibli-music';
export const GHIBLI_FILM_KEY = 'ghibli-film';
export const GHIBLI_SOUND_EVENT = 'ghibli-sound-toggle';
export const GHIBLI_MUSIC_EVENT = 'ghibli-music-toggle';
export const GHIBLI_FILM_EVENT = 'ghibli-film-change';
export const GHIBLI_ASSET_BASE = '/decorative/ghibli';

/** The five films, ordered by worldwide box office (highest first). */
export const GHIBLI_FILMS = ['spirited', 'heron', 'howl', 'mononoke', 'ponyo'] as const;
export type GhibliFilm = (typeof GHIBLI_FILMS)[number];

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

export function ghibliSoundEnabled(): boolean {
  return readFlag(GHIBLI_SOUND_KEY);
}

export function ghibliMusicEnabled(): boolean {
  return readFlag(GHIBLI_MUSIC_KEY);
}

export function writeGhibliFlag(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, String(enabled));
  } catch {}
}

function isFilm(value: unknown): value is GhibliFilm {
  return typeof value === 'string' && (GHIBLI_FILMS as readonly string[]).includes(value);
}

export function readGhibliFilm(): GhibliFilm {
  try {
    const saved = localStorage.getItem(GHIBLI_FILM_KEY);
    if (isFilm(saved)) return saved;
  } catch {}
  return 'spirited';
}

export function writeGhibliFilm(film: GhibliFilm): void {
  try {
    localStorage.setItem(GHIBLI_FILM_KEY, film);
  } catch {}
  window.dispatchEvent(new CustomEvent(GHIBLI_FILM_EVENT));
}

function subscribeFilm(callback: () => void) {
  window.addEventListener(GHIBLI_FILM_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(GHIBLI_FILM_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useGhibliFilm(): GhibliFilm {
  return useSyncExternalStore(subscribeFilm, readGhibliFilm, () => 'spirited');
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function asset(path: string): string {
  return `${GHIBLI_ASSET_BASE}/${path}`;
}

/** Lantern Dusk: the evening palette. Off unless the visitor turned it on. */
export const GHIBLI_LANTERN_KEY = 'ghibli-lantern';
export const GHIBLI_LANTERN_EVENT = 'ghibli-lantern-change';

export function readGhibliLantern(): boolean {
  try {
    return localStorage.getItem(GHIBLI_LANTERN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeGhibliLantern(enabled: boolean): void {
  try {
    localStorage.setItem(GHIBLI_LANTERN_KEY, String(enabled));
  } catch {}
  window.dispatchEvent(new CustomEvent(GHIBLI_LANTERN_EVENT));
}

function subscribeLantern(callback: () => void) {
  window.addEventListener(GHIBLI_LANTERN_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(GHIBLI_LANTERN_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useGhibliLantern(): boolean {
  return useSyncExternalStore(subscribeLantern, readGhibliLantern, () => false);
}
