import { notFound, permanentRedirect } from 'next/navigation';

import {
  modelRouteAvailableForTab,
  modelRoutePath,
  pathWithSearchParams,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import {
  parseProfitRouteFilters,
  profitRoutePathname,
  type ProfitRouteTab,
} from '@/lib/routing/profit-estimator-routes';

export interface ProfitRouteProps {
  params: Promise<{ model: string; filters?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function profitRouteInput(
  tab: ProfitRouteTab,
  zh: boolean,
  { params, searchParams }: ProfitRouteProps,
) {
  const [{ model, filters = [] }, query] = await Promise.all([params, searchParams]);
  const resolved = resolveModelRouteSlug(model);
  const route = parseProfitRouteFilters(filters);
  if (!resolved || !modelRouteAvailableForTab(tab, resolved.route.model) || !route) notFound();

  const { i_pctl, percentile, ...activeQuery } = query;
  const merged = { ...activeQuery, ...Object.fromEntries(route) };
  // Filtered paths are authoritative; retain legacy model queries on bare model pages.
  if (filters.length > 0) merged.g_model = resolved.route.model;
  const retiredPercentile =
    i_pctl !== undefined ||
    percentile !== undefined ||
    filters.some((segment, index) => index % 2 === 0 && segment === 'percentile');
  if (resolved.isAlias || retiredPercentile) {
    const base = `${zh ? '/zh' : ''}${modelRoutePath(tab, resolved.route.slug)}`;
    const pathname = profitRoutePathname(base, route) ?? base;
    permanentRedirect(pathWithSearchParams(pathname, activeQuery));
  }
  return { resolved, searchParams: merged };
}
