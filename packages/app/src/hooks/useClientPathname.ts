'use client';

import { useSyncExternalStore } from 'react';

import { CLIENT_PATHNAME_CHANGE_EVENT } from '@/lib/client-navigation';

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

/**
 * Live address-bar pathname. `usePathname` deliberately keeps the
 * server-rendered value after `replaceClientPathname` rewrites the URL for
 * per-model dashboard routes; controls that map the CURRENT address to a
 * destination (the header language toggle) read this instead. The router
 * pathname is the server snapshot, so SSR markup and hydration stay
 * consistent; on the client the snapshot re-reads `window.location.pathname`,
 * which App Router navigations, popstate, and `replaceClientPathname` all
 * keep current.
 */
export function useClientPathname(routerPathname: string): string {
  return useSyncExternalStore(
    subscribeClientPathname,
    () => window.location.pathname,
    () => routerPathname,
  );
}
