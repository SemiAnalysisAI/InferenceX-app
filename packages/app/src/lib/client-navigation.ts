'use client';

import type { MouseEvent } from 'react';

interface RouterLike {
  push(href: string): void;
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
