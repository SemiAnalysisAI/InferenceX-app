import { isZhPathname, type Locale, ZH_PREFIX } from '@/lib/i18n/i18n';
import { AGENTX_ROUTE, getDashboardRoute } from '@/lib/routing/dashboard-routes';

// Dynamic App Router segments, so pageviews and web vitals group by template instead of by URL.
const DYNAMIC_ROUTE_TEMPLATES = [
  `${getDashboardRoute('agentic-workload-explorer').path}/sessions/[id]`,
  `${getDashboardRoute('agentic-workload-explorer').path}/sessions/[id]/[view]`,
  `${AGENTX_ROUTE.path}/optimizations/[framework]`,
  `${AGENTX_ROUTE.path}/[slug]`,
  `${AGENTX_ROUTE.path}/[slug]/conversations/[convId]`,
  '/blog/[slug]',
  `${getDashboardRoute('calculator').path}/[model]`,
  '/chips/[slug]',
  '/compare/[slug]',
  '/compare/[slug]/[scenario]',
  '/compare-per-dollar/[slug]',
  '/compare-per-dollar/[slug]/[scenario]',
  '/compare-precision/[slug]',
  '/compare-precision/[slug]/[scenario]',
  '/compare-spec-decode/[slug]',
  '/compare-spec-decode/[slug]/[scenario]',
  '/embed/model/[slug]',
  '/glossary/[slug]',
  '/hardware/[slug]',
  `${getDashboardRoute('historical').path}/[model]`,
  `${getDashboardRoute('inference').path}/agentic`,
  `${getDashboardRoute('inference').path}/agentic/[id]`,
  `${getDashboardRoute('inference').path}/logs/[id]`,
  `${getDashboardRoute('inference').path}/[model]`,
  '/model/[slug]',
  `${getDashboardRoute('profit-estimator').path}/[model]`,
  `${getDashboardRoute('profit-estimator').path}/[model]/[...filters]`,
  `${getDashboardRoute('profit-estimator-per-gigawatt').path}/[model]`,
  `${getDashboardRoute('profit-estimator-per-gigawatt').path}/[model]/[...filters]`,
  '/rankings/[slug]',
  '/run/[slug]',
  '/whitepaper/[slug]',
] as const;

const PARSED_TEMPLATES = DYNAMIC_ROUTE_TEMPLATES.map((template) => ({
  template,
  segments: template.split('/').filter(Boolean),
}));

function matches(templateSegments: readonly string[], segments: readonly string[]): boolean {
  for (let i = 0; i < templateSegments.length; i++) {
    const part = templateSegments[i];
    if (part.startsWith('[...')) return segments.length > i;
    if (i >= segments.length) return false;
    if (!part.startsWith('[') && part !== segments[i]) return false;
  }
  return templateSegments.length === segments.length;
}

function stripLocale(pathname: string): string {
  if (!isZhPathname(pathname)) return pathname;
  return pathname.slice(ZH_PREFIX.length) || '/';
}

/** Locale-independent route template for a pathname, e.g. `/zh/infx/inference/kimi-k3` → `/infx/inference/[model]`. */
export function routeTemplateForPathname(pathname: string): string {
  const enPath = stripLocale(pathname);
  const segments = enPath.split('/').filter(Boolean);
  // Static segments win over dynamic ones, as in the App Router.
  let best: { template: string; staticCount: number } | null = null;
  for (const { template, segments: templateSegments } of PARSED_TEMPLATES) {
    if (!matches(templateSegments, segments)) continue;
    const staticCount = templateSegments.filter((part) => !part.startsWith('[')).length;
    if (!best || staticCount > best.staticCount) best = { template, staticCount };
  }
  if (best) return best.template;
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function localeForPathname(pathname: string): Locale {
  return isZhPathname(pathname) ? 'zh' : 'en';
}
