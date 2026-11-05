import { isZhPathname, type Locale, ZH_PREFIX } from '@/lib/i18n/i18n';

// Dynamic App Router segments, so pageviews and web vitals group by template instead of by URL.
const DYNAMIC_ROUTE_TEMPLATES = [
  '/agentic-workload-explorer/sessions/[id]',
  '/agentic-workload-explorer/sessions/[id]/[view]',
  '/agentx/optimizations/[framework]',
  '/agentx/[slug]',
  '/agentx/[slug]/conversations/[convId]',
  '/blog/[slug]',
  '/calculator/[model]',
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
  '/historical/[model]',
  '/inference/agentic',
  '/inference/agentic/[id]',
  '/inference/logs/[id]',
  '/inference/[model]',
  '/model/[slug]',
  '/profit-estimator/[model]',
  '/profit-estimator/[model]/[...filters]',
  '/profit-estimator-per-gigawatt/[model]',
  '/profit-estimator-per-gigawatt/[model]/[...filters]',
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

/** Locale-independent route template for a pathname, e.g. `/zh/inference/kimi-k3` → `/inference/[model]`. */
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
