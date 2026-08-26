'use client';

import { useSyncExternalStore } from 'react';

import { CLIENT_PATHNAME_CHANGE_EVENT, getClientPathnameOverride } from '@/lib/client-navigation';

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
 * The router pathname, corrected for in-place `replaceClientPathname`
 * rewrites. `usePathname` deliberately keeps the server-rendered value after
 * per-model dashboard routes rewrite the URL on a model switch; controls that
 * map the CURRENT address to a destination (the header language toggle) read
 * this instead. The override is honored only while the address bar still
 * matches it, so App Router navigations (which update `routerPathname`) and
 * popstate transitions retire it naturally — and environments where the
 * browser URL is not the route (component tests) keep the router value.
 */
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
