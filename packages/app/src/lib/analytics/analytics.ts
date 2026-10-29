import { localeForPathname, routeTemplateForPathname } from './route-template';

export interface AnalyticsCaptureOptions {
  timestamp?: Date;
  transport?: 'XHR' | 'fetch' | 'sendBeacon';
}

export interface AnalyticsClient {
  capture: (
    eventName: string,
    properties?: Record<string, unknown>,
    options?: AnalyticsCaptureOptions,
  ) => void;
  register?: (properties: Record<string, unknown>) => void;
}

interface PendingEvent {
  eventName: string;
  properties: Record<string, unknown>;
  options: AnalyticsCaptureOptions;
}

export const MAX_PENDING_EVENTS = 200;

const pendingEvents: PendingEvent[] = [];
let analyticsClient: AnalyticsClient | null = null;
let lastPageview: { pathname: string; href: string } | null = null;
let pageContext: Record<string, unknown> = {};
let pageviewSequence = 0;
/** Keys already sent by `trackOncePerPageview` for the page view identified by `scope`. */
let pageviewOnce: { scope: string; keys: Set<string> } | null = null;
const sessionOnceFallback = new Set<string>();

export const SESSION_ONCE_STORAGE_PREFIX = 'inferencex:analytics-once:';

function currentHref(): string | null {
  const location = typeof window === 'undefined' ? undefined : window.location;
  if (!location?.href) return null;
  return location.href;
}

function send(
  client: AnalyticsClient,
  eventName: string,
  properties: Record<string, unknown> | undefined,
  options: AnalyticsCaptureOptions | undefined,
): void {
  if (eventName === '$pageview' && client.register && properties) {
    client.register({ route_template: properties.route_template, locale: properties.locale });
  }
  if (options) client.capture(eventName, properties, options);
  else client.capture(eventName, properties);
}

export function registerAnalyticsClient(client: AnalyticsClient): void {
  analyticsClient = client;
  for (const event of pendingEvents.splice(0)) {
    send(client, event.eventName, event.properties, event.options);
  }
}

export function hasPendingAnalyticsEvents(): boolean {
  return pendingEvents.length > 0;
}

function enqueue(
  eventName: string,
  properties: Record<string, unknown> | undefined,
  options: AnalyticsCaptureOptions | undefined,
): void {
  if (pendingEvents.length >= MAX_PENDING_EVENTS) return;
  const href = currentHref();
  pendingEvents.push({
    eventName,
    // Stamp URL and page context now; replaying later would attribute the event to whatever page is open then.
    properties: {
      ...pageContext,
      ...(href ? { $current_url: href, $pathname: new URL(href).pathname } : {}),
      ...properties,
    },
    options: { ...options, timestamp: new Date() },
  });
}

function dispatch(
  eventName: string,
  properties: Record<string, unknown> | undefined,
  options: AnalyticsCaptureOptions | undefined,
): void {
  if (analyticsClient) send(analyticsClient, eventName, properties, options);
  else enqueue(eventName, properties, options);
}

export function track(
  eventName: string,
  properties?: Record<string, unknown>,
  options?: AnalyticsCaptureOptions,
): void {
  if (typeof window === 'undefined') return;
  // Page effects run before PageViewTracker's effect on first load and after client navigations alike,
  // so record the current page's pageview first whenever the pathname moved since the last one.
  const href = currentHref();
  if (href && lastPageview?.pathname !== pageviewHref(href).pathname) trackPageview(href);
  dispatch(eventName, properties, options);
}

function pageviewHref(href: string): URL {
  const url = new URL(href);
  url.hash = '';
  return url;
}

function capturePageview(url: URL, extra?: Record<string, unknown>): void {
  lastPageview = { pathname: url.pathname, href: url.href };
  pageviewSequence += 1;
  // A page effect can run before PageViewTracker records the pageview it belongs to. Keep the keys it
  // sent so the pageview that follows does not re-arm them.
  if (pageviewOnce?.scope === pendingScope(url.pathname)) {
    pageviewOnce.scope = String(pageviewSequence);
  }
  pageContext = {
    route_template: routeTemplateForPathname(url.pathname),
    locale: localeForPathname(url.pathname),
  };
  dispatch(
    '$pageview',
    { ...pageContext, $current_url: url.href, $pathname: url.pathname, ...extra },
    undefined,
  );
}

function pendingScope(pathname: string): string {
  return `pending:${pathname}`;
}

/** Records a `$pageview` for `href` (default: the current URL) unless it is the page last recorded. */
export function trackPageview(href?: string): void {
  if (typeof window === 'undefined') return;
  const target = href ?? currentHref();
  if (!target) return;
  const url = pageviewHref(target);
  if (lastPageview?.href === url.href) return;
  capturePageview(url);
}

/**
 * Records a `$pageview` for a client-side URL rewrite that bypasses the Next router, but only when the
 * pathname changed. Query-only changes (filters, controls) are not pageviews.
 */
export function trackVirtualPageview(href: string, navigationType: string): void {
  if (typeof window === 'undefined') return;
  const url = pageviewHref(new URL(href, window.location.origin).href);
  if (lastPageview?.pathname === url.pathname) return;
  capturePageview(url, { navigation_type: navigationType });
}

/**
 * Tracks `eventName` at most once per page view (the same unit `$pageview` counts), keyed by
 * `dedupeKey`. Remounts, StrictMode double effects and dependency changes on the same page are
 * dropped. Navigating away and back is a new page view and tracks again. Returns whether it sent.
 */
export function trackOncePerPageview(
  eventName: string,
  properties?: Record<string, unknown>,
  dedupeKey = '',
): boolean {
  if (typeof window === 'undefined') return false;
  if (!lastPageview && currentHref()) trackPageview();
  const pathname = window.location.pathname;
  const scope =
    lastPageview?.pathname === pathname ? String(pageviewSequence) : pendingScope(pathname);
  if (pageviewOnce?.scope !== scope) pageviewOnce = { scope, keys: new Set() };
  const key = `${eventName}\n${dedupeKey}`;
  if (pageviewOnce.keys.has(key)) return false;
  pageviewOnce.keys.add(key);
  track(eventName, properties);
  return true;
}

/**
 * Tracks `eventName` at most once per browser tab session (sessionStorage), keyed by `dedupeKey`.
 * Falls back to module memory when storage is unavailable. Returns whether it sent.
 */
export function trackOncePerSession(
  eventName: string,
  properties?: Record<string, unknown>,
  dedupeKey = '',
): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${SESSION_ONCE_STORAGE_PREFIX}${eventName}:${dedupeKey}`;
  if (sessionOnceFallback.has(key)) return false;
  try {
    if (window.sessionStorage.getItem(key) !== null) return false;
    window.sessionStorage.setItem(key, '1');
  } catch {
    sessionOnceFallback.add(key);
  }
  track(eventName, properties);
  return true;
}
