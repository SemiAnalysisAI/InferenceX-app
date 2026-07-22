import { SITE_URL } from '@semianalysisai/inferencex-constants';

/**
 * Minimal locale plumbing for the Simplified Chinese (/zh) page tree.
 *
 * The site is not fully internationalized — instead, every indexable page has
 * a hand-authored Chinese sibling under /zh (see AGENTS.md "Chinese Website
 * Pages"). These helpers keep the URL mapping and hreflang alternates in one
 * place so English and Chinese pages always point at each other consistently.
 */

export type Locale = 'en' | 'zh';

export const ZH_PREFIX = '/zh';

/** BCP 47 tag used for hreflang, JSON-LD inLanguage, and the html lang attribute. */
export const ZH_LANG_TAG = 'zh-CN';

/** Open Graph locale for zh pages. */
export const ZH_OG_LOCALE = 'zh_CN';

/** `/` → `/zh`, `/blog/foo` → `/zh/blog/foo`. */
export function zhPath(enPath: string): string {
  return enPath === '/' ? ZH_PREFIX : `${ZH_PREFIX}${enPath}`;
}

export function isZhPathname(pathname: string): boolean {
  return pathname === ZH_PREFIX || pathname.startsWith(`${ZH_PREFIX}/`);
}

/**
 * English routes that have a Chinese sibling page. Used by the header nav and
 * the language switcher so we never link into a /zh URL that doesn't exist.
 * `exact` entries only match the path itself; prefix entries also match any
 * child path (e.g. /blog matches /blog/some-post).
 */
export const ZH_MIRRORED_ROUTES: readonly { path: string; exact?: boolean }[] = [
  { path: '/', exact: true },
  { path: '/overview', exact: true },
  { path: '/inference', exact: true },
  { path: '/inference/agentic' },
  { path: '/evaluation', exact: true },
  { path: '/historical', exact: true },
  { path: '/calculator', exact: true },
  { path: '/reliability', exact: true },
  { path: '/gpu-specs', exact: true },
  { path: '/gpu-metrics', exact: true },
  { path: '/submissions', exact: true },
  { path: '/ai-chart', exact: true },
  { path: '/current-inferencex-image', exact: true },
  { path: '/feedback', exact: true },
  { path: '/about', exact: true },
  { path: '/quotes', exact: true },
  { path: '/land-acknowledgement', exact: true },
  { path: '/compare' },
  { path: '/compare-per-dollar' },
  { path: '/compare-precision' },
  { path: '/compare-spec-decode' },
  { path: '/blog' },
  { path: '/glossary' },
  { path: '/datasets' },
];

export function hasZhSibling(enPathname: string): boolean {
  return ZH_MIRRORED_ROUTES.some((route) =>
    route.exact
      ? enPathname === route.path
      : enPathname === route.path || enPathname.startsWith(`${route.path}/`),
  );
}

/**
 * Map the current pathname to its counterpart in the other language, for the
 * header language switcher. English pages without a Chinese sibling fall back
 * to the /zh homepage; unknown /zh paths fall back to the English homepage.
 */
export function switchLocalePath(pathname: string): string {
  if (isZhPathname(pathname)) {
    const enPathname = pathname === ZH_PREFIX ? '/' : pathname.slice(ZH_PREFIX.length);
    return hasZhSibling(enPathname) ? enPathname : '/';
  }
  return hasZhSibling(pathname) ? zhPath(pathname) : ZH_PREFIX;
}

/**
 * hreflang map linking an English page and its Chinese sibling. Spread into
 * `alternates.languages` on BOTH pages so each references the full set, per
 * Google's bidirectional hreflang requirement. English is the x-default.
 */
export function languageAlternates(enPath: string): Record<string, string> {
  const enUrl = enPath === '/' ? SITE_URL : `${SITE_URL}${enPath}`;
  return {
    en: enUrl,
    [ZH_LANG_TAG]: `${SITE_URL}${zhPath(enPath)}`,
    'x-default': enUrl,
  };
}

/** `alternates` metadata for the English side of a mirrored page pair. */
export function enAlternates(enPath: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  return {
    canonical: enPath === '/' ? SITE_URL : `${SITE_URL}${enPath}`,
    languages: languageAlternates(enPath),
  };
}

/** `alternates` metadata for the Chinese side of a mirrored page pair. */
export function zhAlternates(enPath: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  return {
    canonical: `${SITE_URL}${zhPath(enPath)}`,
    languages: languageAlternates(enPath),
  };
}
