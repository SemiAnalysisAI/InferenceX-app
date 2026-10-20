'use client';

import { useSyncExternalStore } from 'react';
import { isEmbedPathname } from '../embed/embed-route';
import { ENABLED_OPTIONAL_THEMES, type OptionalTheme } from './themes';

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function snapshot(): OptionalTheme | null {
  const root = document.documentElement;
  if (isEmbedPathname(window.location.pathname) || Object.hasOwn(root.dataset, 'inferencexEmbed'))
    return null;
  return ENABLED_OPTIONAL_THEMES.find((theme) => root.classList.contains(theme)) ?? null;
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
