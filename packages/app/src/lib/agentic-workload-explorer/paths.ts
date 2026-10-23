import type { Locale } from '@/lib/i18n/i18n';

export const EXPLORER_BASE_PATH = '/agentic-workload-explorer';

export const EXPLORER_API_BASE = '/api/v1/agentic-workload-explorer';

export function explorerHref(path: string, locale: Locale = 'en'): string {
  const suffix = path === '/' ? '' : path;
  const localePrefix = locale === 'zh' ? '/zh' : '';
  return `${localePrefix}${EXPLORER_BASE_PATH}${suffix}`;
}

export function explorerRelativePath(pathname: string): string | null {
  const enPath = pathname.replace(/^\/zh(?=\/|$)/u, '');
  if (enPath === EXPLORER_BASE_PATH) return '/';
  if (!enPath.startsWith(`${EXPLORER_BASE_PATH}/`)) return null;
  return enPath.slice(EXPLORER_BASE_PATH.length);
}

export function versionQuery(version: string | string[] | null | undefined): string {
  const value = Array.isArray(version) ? version[0] : version;
  return value === null || value === undefined ? '' : `?version=${encodeURIComponent(value)}`;
}

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
