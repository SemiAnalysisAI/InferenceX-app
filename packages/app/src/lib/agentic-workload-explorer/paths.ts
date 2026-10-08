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
