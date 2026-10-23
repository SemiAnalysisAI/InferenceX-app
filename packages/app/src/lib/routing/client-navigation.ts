'use client';

import type { MouseEvent } from 'react';

interface RouterLike {
  push: (href: string) => void;
}

export const CLIENT_SEARCH_CHANGE_EVENT = 'inferencex:client-search-change';
export const CLIENT_PATHNAME_CHANGE_EVENT = 'inferencex:client-pathname-change';

export function notifyClientSearchChange(href: string): void {
  const search = new URL(href, window.location.origin).search;
  window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT, { detail: search }));
}

export function replaceClientSearch(searchParams: URLSearchParams): void {
  const search = searchParams.toString();
  const href = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  History.prototype.replaceState.call(window.history, window.history.state, '', href);
  notifyClientSearchChange(href);
}

export function replaceClientPathname(pathname: string, dropParams: readonly string[] = []): void {
  const search = new URLSearchParams(window.location.search);
  for (const param of dropParams) search.delete(param);
  const qs = search.toString();
  if (window.location.pathname === pathname && window.location.search === (qs ? `?${qs}` : ''))
    return;
  const href = `${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  const nativeReplace =
    typeof History === 'undefined' ? window.history.replaceState : History.prototype.replaceState;
  nativeReplace.call(window.history, window.history.state, '', href);
  clientPathnameOverride = pathname;
  window.dispatchEvent(new CustomEvent(CLIENT_PATHNAME_CHANGE_EVENT, { detail: pathname }));
  notifyClientSearchChange(href);
}

let clientPathnameOverride: string | null = null;

export function getClientPathnameOverride(): string | null {
  return clientPathnameOverride;
}

export function replaceRouterPathname(target: string, dropParams: readonly string[] = []): void {
  const search = new URLSearchParams(window.location.search);
  for (const param of dropParams) search.delete(param);
  const qs = search.toString();
  if (window.location.pathname === target && window.location.search === (qs ? `?${qs}` : ''))
    return;
  window.history.replaceState(
    window.history.state,
    '',
    `${target}${qs ? `?${qs}` : ''}${window.location.hash}`,
  );
  clientPathnameOverride = target;
  window.dispatchEvent(new CustomEvent(CLIENT_PATHNAME_CHANGE_EVENT, { detail: target }));
  notifyClientSearchChange(`${target}${qs ? `?${qs}` : ''}${window.location.hash}`);
}

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
