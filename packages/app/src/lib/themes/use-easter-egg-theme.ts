'use client';

import { useSyncExternalStore } from 'react';
import { isEmbedPathname } from '../embed/embed-route';

export type EasterEggTheme = 'minecraft' | 'csgo' | 'gta' | 'doom' | 'halo' | 'pokemon';
const themes: EasterEggTheme[] = ['minecraft', 'csgo', 'gta', 'doom', 'halo', 'pokemon'];
const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function snapshot(): EasterEggTheme | null {
  const root = document.documentElement;
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

export function useEasterEggTheme() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
