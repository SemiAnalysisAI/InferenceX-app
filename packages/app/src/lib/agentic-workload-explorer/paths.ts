import type { Locale } from '@/lib/i18n';

/** English route prefix of the Agentic Workload Explorer pages. */
export const EXPLORER_BASE_PATH = '/agentic-workload-explorer';

/** Prefix of the explorer's read-only JSON API. */
export const EXPLORER_API_BASE = '/api/v1/agentic-workload-explorer';

/**
 * Absolute page path for an explorer-relative path (`/` is the overview,
 * `/sessions/abc` a session). `/zh` pages link to their `/zh` siblings.
 */
export function explorerHref(path: string, locale: Locale = 'en'): string {
  const suffix = path === '/' ? '' : path;
  const localePrefix = locale === 'zh' ? '/zh' : '';
  return `${localePrefix}${EXPLORER_BASE_PATH}${suffix}`;
}

/**
 * Explorer-relative path for a full pathname (`/zh/agentic-workload-explorer/sessions`
 * → `/sessions`), or `null` when the pathname is outside the explorer.
 */
export function explorerRelativePath(pathname: string): string | null {
  const enPath = pathname.replace(/^\/zh(?=\/|$)/u, '');
  if (enPath === EXPLORER_BASE_PATH) return '/';
  if (!enPath.startsWith(`${EXPLORER_BASE_PATH}/`)) return null;
  return enPath.slice(EXPLORER_BASE_PATH.length);
}

/**
 * Query string carried across explorer links. The trace-version selection
 * lives only in `?version=`, so dropping it would reset the filter.
 */
export function versionQuery(version: string | string[] | null | undefined): string {
  const value = Array.isArray(version) ? version[0] : version;
  return value === null || value === undefined ? '' : `?version=${encodeURIComponent(value)}`;
}

/**
 * Add the trace-version selection to an explorer href that may already carry
 * a query string or a `#fragment`. An explicit `version` in `href` wins.
 */
export function withVersion(href: string, version: string | null): string {
  if (version === null) return href;
  const hashAt = href.indexOf('#');
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1));
  if (!params.has('version')) params.set('version', version);
  return `${path}?${params.toString()}${hash}`;
}
