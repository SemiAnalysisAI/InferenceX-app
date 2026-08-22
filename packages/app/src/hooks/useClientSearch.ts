'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/client-navigation';

const subscribers = new Set<() => void>();
let listening = false;

function emitSearchChange(): void {
  for (const subscriber of subscribers) subscriber();
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', emitSearchChange);
  window.addEventListener(CLIENT_SEARCH_CHANGE_EVENT, emitSearchChange);
  listening = true;
}

function stopListening(): void {
  if (!listening || subscribers.size > 0 || typeof window === 'undefined') return;
  window.removeEventListener('popstate', emitSearchChange);
  window.removeEventListener(CLIENT_SEARCH_CHANGE_EVENT, emitSearchChange);
  listening = false;
}

/** One shared external store for the browser's current query string. */
export function subscribeClientSearch(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  startListening();
  return () => {
    subscribers.delete(subscriber);
    stopListening();
  };
}

export function getClientSearchSnapshot(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

export function getServerSearchSnapshot(): string {
  return '';
}

/**
 * Hydration-safe live query-string snapshot. History writes remain explicit;
 * callers that use pushState/replaceState must dispatch CLIENT_SEARCH_CHANGE_EVENT.
 */
export function useClientSearch(): string {
  return useSyncExternalStore(
    subscribeClientSearch,
    getClientSearchSnapshot,
    getServerSearchSnapshot,
  );
}

export function useClientSearchParams(): URLSearchParams {
  const search = useClientSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}
