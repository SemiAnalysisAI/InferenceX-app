import {
  modelRouteAvailableForTab,
  modelRoutePath,
  parseModelRoutePathname,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import {
  isProfitRouteTab,
  parseProfitRouteFilters,
  profitRoutePathname,
} from '@/lib/routing/profit-estimator-routes';

const RETIRED_PROFIT_PARAMS = ['i_pctl', 'percentile'] as const;

/** A retired percentile filter segment the profit routes drop when canonicalizing. */
export function hasRetiredPercentileSegment(filters: readonly string[]): boolean {
  return filters.some((segment, index) => index % 2 === 0 && segment === 'percentile');
}

/**
 * Model-route pages are static, so they cannot see the query. The proxy uses this to send an
 * alias or mixed-case model slug, or a retired profit percentile, to the canonical URL with every
 * other parameter intact. Returns null when the URL should load as is: already canonical, or a 404
 * the page renders.
 */
export function modelRouteRedirectUrl(url: URL): URL | null {
  const parsed = parseModelRoutePathname(url.pathname);
  const resolved = parsed?.slug ? resolveModelRouteSlug(parsed.slug) : null;
  if (!parsed || !resolved) return null;
  const base = `${parsed.zh ? '/zh' : ''}${modelRoutePath(parsed.tab, resolved.route.slug)}`;
  const target = new URL(url);
  if (isProfitRouteTab(parsed.tab)) {
    let filters: string[];
    try {
      filters = url.pathname
        .split('/')
        .filter(Boolean)
        .slice(parsed.zh ? 3 : 2)
        .map(decodeURIComponent);
    } catch {
      return null;
    }
    const route = parseProfitRouteFilters(filters);
    if (!route || !modelRouteAvailableForTab(parsed.tab, resolved.route.model)) return null;
    const retired =
      RETIRED_PROFIT_PARAMS.some((key) => url.searchParams.has(key)) ||
      hasRetiredPercentileSegment(filters);
    if (!resolved.isAlias && !retired) return null;
    for (const key of RETIRED_PROFIT_PARAMS) target.searchParams.delete(key);
    target.pathname = profitRoutePathname(base, route) ?? base;
  } else {
    if (!resolved.isAlias) return null;
    target.pathname = base;
  }
  target.search = target.searchParams.toString();
  return target;
}
