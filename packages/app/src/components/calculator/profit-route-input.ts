import { notFound, permanentRedirect } from 'next/navigation';

import {
  modelRouteAvailableForTab,
  modelRoutePath,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { hasRetiredPercentileSegment } from '@/lib/routing/model-route-redirect';
import {
  parseProfitRouteFilters,
  profitRoutePathname,
  type ProfitRouteTab,
} from '@/lib/routing/profit-estimator-routes';

export interface ProfitRouteProps {
  params: Promise<{ model: string; filters?: string[] }>;
}

export async function profitRouteInput(
  tab: ProfitRouteTab,
  zh: boolean,
  params: ProfitRouteProps['params'],
) {
  const { model, filters = [] } = await params;
  const resolved = resolveModelRouteSlug(model);
  const route = parseProfitRouteFilters(filters);
  if (!resolved || !modelRouteAvailableForTab(tab, resolved.route.model) || !route) notFound();
  if (resolved.isAlias || hasRetiredPercentileSegment(filters)) {
    const base = `${zh ? '/zh' : ''}${modelRoutePath(tab, resolved.route.slug)}`;
    permanentRedirect(profitRoutePathname(base, route) ?? base);
  }
  return resolved;
}
