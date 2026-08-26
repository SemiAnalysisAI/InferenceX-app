'use client';

import type { MouseEvent } from 'react';

interface RouterLike {
  push: (href: string) => void;
}

export const CLIENT_SEARCH_CHANGE_EVENT = 'inferencex:client-search-change';
export const CLIENT_PATHNAME_CHANGE_EVENT = 'inferencex:client-pathname-change';

/** Keep persistent layout controls in sync when an App Router transition only
 *  changes search params and therefore reuses the root layout. */
export function notifyClientSearchChange(href: string): void {
  const search = new URL(href, window.location.origin).search;
  window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT, { detail: search }));
}

/**
 * Replace only the current document's query string without involving the App
 * Router. Next patches `window.history.replaceState`; calling the pristine
 * prototype method avoids an RSC navigation for client-owned URL state.
 */
export function replaceClientSearch(searchParams: URLSearchParams): void {
  const search = searchParams.toString();
  const href = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  History.prototype.replaceState.call(window.history, window.history.state, '', href);
  notifyClientSearchChange(href);
}

/**
 * Replace only the current document's pathname (keeping search and hash)
 * without involving the App Router — same pristine-prototype trick as
 * `replaceClientSearch`. Used by per-model dashboard routes so switching
 * models rewrites `/historical/kimi-k3` in the address bar without an RSC
 * navigation or component remount. `usePathname` intentionally keeps the
 * server-rendered value; route resolution is prefix-based, so nav highlight,
 * providers, and share scopes are unaffected. Controls that must reflect the
 * live address bar (the header language toggle) subscribe via
 * `useClientPathname`, which listens for CLIENT_PATHNAME_CHANGE_EVENT.
 */
export function replaceClientPathname(pathname: string): void {
  const href = `${pathname}${window.location.search}${window.location.hash}`;
  History.prototype.replaceState.call(window.history, window.history.state, '', href);
  clientPathnameOverride = pathname;
  window.dispatchEvent(new CustomEvent(CLIENT_PATHNAME_CHANGE_EVENT, { detail: pathname }));
}

let clientPathnameOverride: string | null = null;

/** The last pathname written by `replaceClientPathname`, or null. Consumers
 *  (useClientPathname) honor it only while the address bar still matches, so
 *  a later App Router navigation naturally retires a stale override. */
export function getClientPathnameOverride(): string | null {
  return clientPathnameOverride;
}

/**
 * Shallow-replace the current pathname, preserving the query string (minus
 * `dropParams`) and hash. Unlike `replaceClientSearch`, this goes through the
 * Next-patched `window.history.replaceState` on purpose: the pathname is
 * changing, so the App Router must adopt the new URL (`usePathname` updates)
 * — but as a same-document rewrite, without an RSC fetch or scroll reset.
 * Router state is carried over so Back/Forward keep working.
 */
export function replaceRouterPathname(target: string, dropParams: readonly string[] = []): void {
  if (window.location.pathname === target) return;
  const search = new URLSearchParams(window.location.search);
  for (const param of dropParams) search.delete(param);
  const qs = search.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${target}${qs ? `?${qs}` : ''}${window.location.hash}`,
  );
}

/**
 * The first dashboard transition can request the route without committing the
 * URL change. Repeating the same app-router push after the route payload has
 * been requested preserves same-document navigation and avoids a music restart.
 */
export function navigateInApp(
  event: MouseEvent<HTMLAnchorElement>,
  router: RouterLike,
  href: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.target
  ) {
    return;
  }

  event.preventDefault();
  const from = window.location.pathname;
  const target = new URL(href, window.location.origin).pathname;
  router.push(href);
  // Retry only while nothing has moved. Once the pathname has changed — to this
  // target, or to a later navigation the user started — a second push only
  // re-renders the destination, cancels its in-flight work and stacks a
  // duplicate history entry.
  window.setTimeout(() => {
    if (window.location.pathname === from && from !== target) router.push(href);
  }, 250);
}
