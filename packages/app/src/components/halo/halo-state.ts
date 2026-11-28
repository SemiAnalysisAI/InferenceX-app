'use client';

import { useSyncExternalStore } from 'react';

export const HALO_CHANGE = 'halo-preferences-changed';
export type HaloMode = 'zeta' | 'reach' | 'reclaim';
const runtime = new Map<string, string>();

export function haloRead(key: string, fallback: string) {
  if (runtime.has(key)) return runtime.get(key) ?? fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function haloWrite(key: string, value: string) {
  runtime.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(HALO_CHANGE));
}

function subscribe(callback: () => void) {
  window.addEventListener(HALO_CHANGE, callback);
  return () => window.removeEventListener(HALO_CHANGE, callback);
}

export function useHaloValue(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribe,
    () => haloRead(key, fallback),
    () => fallback,
  );
}
