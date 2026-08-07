'use client';

import type { MouseEvent } from 'react';

interface RouterLike {
  push: (href: string) => void;
}

export const CLIENT_SEARCH_CHANGE_EVENT = 'inferencex:client-search-change';

/** Keep persistent layout controls in sync when an App Router transition only
 *  changes search params and therefore reuses the root layout. */
export function notifyClientSearchChange(href: string): void {
  const search = new URL(href, window.location.origin).search;
  window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT, { detail: search }));
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
  router.push(href);
  window.setTimeout(() => router.push(href), 250);
}
