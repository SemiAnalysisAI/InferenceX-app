import type { DashboardRouteKey } from '@/lib/routing/dashboard-routes';
import { crossTabParams, selectionTabKind } from '@/lib/routing/cross-tab-selection';
import { getInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import { profitRoutePathname } from '@/lib/routing/profit-estimator-routes';
import { currentChartSearch } from '@/lib/routing/url-state';

/**
 * The href a tab switch between inference and the profit estimators opens, built from the live
 * selections at click time because filter changes do not update the rendered tab hrefs.
 */
export function crossTabHref(
  current: DashboardRouteKey,
  destination: DashboardRouteKey,
  destinationPath: string,
  liveSearch: string = currentChartSearch(),
): string | null {
  const from = selectionTabKind(current);
  const to = selectionTabKind(destination);
  if (!from || !to || current === destination) return null;
  const live = new URLSearchParams(liveSearch);
  const model = getInferenceNavigationModel();
  if (model) live.set('g_model', model);
  const params = crossTabParams(from, to, live);
  if (to === 'profit') return profitRoutePathname(destinationPath, params);
  const search = params.toString();
  return `${destinationPath}${search ? `?${search}` : ''}`;
}
