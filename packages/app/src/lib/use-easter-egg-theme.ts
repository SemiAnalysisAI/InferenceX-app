'use client';

import { useSyncExternalStore } from 'react';
import { isEmbedPathname } from './embed-route';

export type EasterEggTheme = 'minecraft' | 'csgo' | 'gta' | 'doom' | 'halo';
const themes: EasterEggTheme[] = ['minecraft', 'csgo', 'gta', 'doom', 'halo'];
const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function snapshot(): EasterEggTheme | null {
  const root = document.documentElement;
  // The saved theme can be applied before a streamed embed stamps its boot attribute.
  if (isEmbedPathname(window.location.pathname) || Object.hasOwn(root.dataset, 'inferencexEmbed'))
    return null;
  return themes.find((theme) => root.classList.contains(theme)) ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach((notify) => notify()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

const serverSnapshot = () => null;

/** One shared observer; no theme content or side effects during SSR. */
export function useEasterEggTheme() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
