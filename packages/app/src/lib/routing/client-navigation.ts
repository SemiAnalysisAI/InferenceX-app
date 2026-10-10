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
 * Same-document navigation for in-app links: preventDefault + `router.push`
 * keeps the transition soft (the Minecraft music keeps playing) while
 * preserving modified-click, middle-click and `target` behaviors.
 *
 * History note: this used to re-push after 250ms because the first
 * landing → dashboard click could "request the route without committing the
 * URL change". The real culprit was `url-state.ts` initializing
 * mid-transition and dispatching a stale router restore through the
 * Next-patched `history.replaceState`, which reverted the just-committed
 * URL; the timed retry then read the reverted address bar, pushed again,
 * stacked a duplicate history entry (breaking a single Back) and visibly
 * restarted the transition. That module no longer talks to the router, so a
 * single push is both sufficient and required.
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
  router.push(href);
}
