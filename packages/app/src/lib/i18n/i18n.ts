import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';

export type Locale = 'en' | 'zh';

export const ZH_PREFIX = '/zh';

export const ZH_LANG_TAG = 'zh-CN';

export const ZH_OG_LOCALE = 'zh_CN';

export function zhPath(enPath: string): string {
  return enPath === '/' ? ZH_PREFIX : `${ZH_PREFIX}${enPath}`;
}

export function localePath(enPath: string, locale: Locale): string {
  return locale === 'zh' ? zhPath(enPath) : enPath;
}

export function isZhPathname(pathname: string): boolean {
  return pathname === ZH_PREFIX || pathname.startsWith(`${ZH_PREFIX}/`);
}

export const ZH_MIRRORED_ROUTES: readonly { path: string; exact?: boolean }[] = [
  { path: '/', exact: true },
  { path: '/overview', exact: true },
  { path: '/api', exact: true },
  ...DASHBOARD_ROUTES.filter((route) => route.localeMirrored).map((route) => ({
    path: route.path,
  })),
  { path: '/about', exact: true },
  { path: '/quotes', exact: true },
  { path: '/land-acknowledgement', exact: true },
  { path: '/compare' },
  { path: '/compare-per-dollar' },
  { path: '/compare-precision' },
  { path: '/compare-spec-decode' },
  { path: '/blog' },
  { path: '/whitepaper' },
  { path: '/glossary' },
  { path: '/hardware' },
  { path: '/chips' },
  { path: '/model' },
  { path: '/embed' },
  { path: '/agentx' },
  { path: '/powerx/tutorial', exact: true },
  { path: '/ubenchx' },
  { path: '/rankings' },
  { path: '/run' },
];

export function hasZhSibling(enPathname: string): boolean {
  return ZH_MIRRORED_ROUTES.some((route) =>
    route.exact
      ? enPathname === route.path
      : enPathname === route.path || enPathname.startsWith(`${route.path}/`),
  );
}

export function switchLocalePath(pathname: string): string {
  if (isZhPathname(pathname)) {
    const enPathname = pathname === ZH_PREFIX ? '/' : pathname.slice(ZH_PREFIX.length);
    return hasZhSibling(enPathname) ? enPathname : '/';
  }
  return hasZhSibling(pathname) ? zhPath(pathname) : ZH_PREFIX;
}

export function languageAlternates(enPath: string): Record<string, string> {
  const enUrl = enPath === '/' ? SITE_URL : `${SITE_URL}${enPath}`;
  return {
    en: enUrl,
    [ZH_LANG_TAG]: `${SITE_URL}${zhPath(enPath)}`,
    'x-default': enUrl,
  };
}

export function enAlternates(enPath: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  return {
    canonical: enPath === '/' ? SITE_URL : `${SITE_URL}${enPath}`,
    languages: languageAlternates(enPath),
  };
}

export function zhAlternates(enPath: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  return {
    canonical: `${SITE_URL}${zhPath(enPath)}`,
    languages: languageAlternates(enPath),
  };
}
