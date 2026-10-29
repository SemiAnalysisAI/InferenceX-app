'use client';

import { useSyncExternalStore } from 'react';

import {
  CLIENT_PATHNAME_CHANGE_EVENT,
  getClientPathnameOverride,
} from '@/lib/routing/client-navigation';

const subscribers = new Set<() => void>();
let listening = false;

function emitPathnameChange(): void {
  for (const subscriber of subscribers) subscriber();
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', emitPathnameChange);
  window.addEventListener(CLIENT_PATHNAME_CHANGE_EVENT, emitPathnameChange);
  listening = true;
}

function stopListening(): void {
  if (!listening || subscribers.size > 0 || typeof window === 'undefined') return;
  window.removeEventListener('popstate', emitPathnameChange);
  window.removeEventListener(CLIENT_PATHNAME_CHANGE_EVENT, emitPathnameChange);
  listening = false;
}

function subscribeClientPathname(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  startListening();
  return () => {
    subscribers.delete(subscriber);
    stopListening();
  };
}

export function useClientPathname(routerPathname: string): string {
  return useSyncExternalStore(
    subscribeClientPathname,
    () => {
      const override = getClientPathnameOverride();
      return override !== null && window.location.pathname === override ? override : routerPathname;
    },
    () => routerPathname,
  );
}
