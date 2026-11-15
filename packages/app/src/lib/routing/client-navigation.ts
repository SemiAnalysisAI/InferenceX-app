'use client';

import type { MouseEvent } from 'react';

interface RouterLike {
  push: (href: string) => void;
}

export const CLIENT_SEARCH_CHANGE_EVENT = 'inferencex:client-search-change';
export const CLIENT_PATHNAME_CHANGE_EVENT = 'inferencex:client-pathname-change';

export interface ClientPathnameChangeDetail {
  pathname: string;
  /** True only when the rewrite represents a new page (model switch), not a filter tweak. */
  pageview: boolean;
}

interface PathnameReplaceOptions {
  pageview?: boolean;
}

function dispatchPathnameChange(pathname: string, pageview: boolean): void {
  window.dispatchEvent(
    new CustomEvent<ClientPathnameChangeDetail>(CLIENT_PATHNAME_CHANGE_EVENT, {
      detail: { pathname, pageview },
    }),
  );
}

export function isPageviewPathnameChange(event: Event): boolean {
  return (event as CustomEvent<ClientPathnameChangeDetail>).detail?.pageview === true;
}

export function notifyClientSearchChange(href: string): void {
  const search = new URL(href, window.location.origin).search;
  window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT, { detail: search }));
}

function searchHref(searchParams: URLSearchParams): string {
  const search = searchParams.toString();
  return `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

export function replaceClientSearch(searchParams: URLSearchParams): void {
  const href = searchHref(searchParams);
  History.prototype.replaceState.call(window.history, window.history.state, '', href);
  notifyClientSearchChange(href);
}

/** `entryState` is merged into the copied Next.js history state, so it survives reload and Forward. */
export function pushClientSearch(
  searchParams: URLSearchParams,
  entryState: Record<string, unknown>,
): void {
  const href = searchHref(searchParams);
  History.prototype.pushState.call(
    window.history,
    { ...window.history.state, ...entryState },
    '',
    href,
  );
  notifyClientSearchChange(href);
}

export function replaceClientPathname(
  pathname: string,
  dropParams: readonly string[] = [],
  { pageview = false }: PathnameReplaceOptions = {},
): void {
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
  dispatchPathnameChange(pathname, pageview);
  notifyClientSearchChange(href);
}

let clientPathnameOverride: string | null = null;

export function getClientPathnameOverride(): string | null {
  return clientPathnameOverride;
}

function rewriteRouterPathname(
  method: 'pushState' | 'replaceState',
  target: string,
  dropParams: readonly string[],
  pageview: boolean,
): void {
  const search = new URLSearchParams(window.location.search);
  for (const param of dropParams) search.delete(param);
  const qs = search.toString();
  if (window.location.pathname === target && window.location.search === (qs ? `?${qs}` : ''))
    return;
  const href = `${target}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history[method](window.history.state, '', href);
  clientPathnameOverride = target;
  dispatchPathnameChange(target, pageview);
  notifyClientSearchChange(href);
}

export function replaceRouterPathname(
  target: string,
  dropParams: readonly string[] = [],
  { pageview = false }: PathnameReplaceOptions = {},
): void {
  rewriteRouterPathname('replaceState', target, dropParams, pageview);
}

/** Like `replaceRouterPathname`, but adds a history entry so Back returns to the previous view. */
export function pushRouterPathname(
  target: string,
  dropParams: readonly string[] = [],
  { pageview = false }: PathnameReplaceOptions = {},
): void {
  rewriteRouterPathname('pushState', target, dropParams, pageview);
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
