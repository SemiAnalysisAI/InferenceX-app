import type { QueryClient } from '@tanstack/react-query';

import type { Model } from '@/lib/catalog/data-mappings';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';
import {
  DEFAULT_INFERENCE_MODEL_SLUG,
  DEFAULT_INFERENCE_REDIRECT_MISSING,
} from '@/lib/routing/inference-model-redirects';
import { inferenceModelForPathname, inferenceModelPath } from '@/lib/routing/inference-model-slug';
import { modelRouteRedirectUrl } from '@/lib/routing/model-route-redirect';
import {
  defaultRouteModel,
  modelRouteAvailableForTab,
  parseModelRoutePathname,
  resolveModelRouteSlug,
} from '@/lib/routing/model-routes';
import { profitRouteParams } from '@/lib/routing/profit-estimator-routes';

export type InferenceRoutePage =
  | 'inference'
  | 'historical'
  | 'evaluation'
  | 'calculator'
  | 'first-token'
  | 'cache-reuse'
  | 'fleet'
  | 'profit-estimator';

export interface InferenceRoute {
  page: InferenceRoutePage;
  /**
   * The English pathname the page renders at once redirects settle. Null when a redirect could
   * send the link to another page, which leaves only route-independent data to warm.
   */
  pathname: string | null;
  search: string;
  /** The `routeModel` prop the page hands its calculator display. */
  routeModel?: Model;
}

const INFERENCE_PATH = getDashboardRoute('inference').path;
const SINGLE_PATH_PAGES = ['evaluation', 'first-token', 'cache-reuse', 'fleet'] as const;
// The proxy can send these Inference links to PowerX instead.
const POWER_LINK_PARAMS = ['i_metric', 'i_power'] as const;
// Resolves relative URLs for the redirect helpers, which read only the path and query.
const URL_BASE = 'https://prefetch.invalid';

/** The dashboard page `pathname` opens, following the redirects in front of it. */
export function resolveInferenceRoute(
  pathname: string,
  searchParams: URLSearchParams,
): InferenceRoute | null {
  const search = searchParams.toString();

  if (pathname === INFERENCE_PATH || inferenceModelForPathname(pathname) !== null) {
    if (POWER_LINK_PARAMS.some((key) => searchParams.has(key))) {
      return { page: 'inference', pathname: null, search };
    }
    if (pathname !== INFERENCE_PATH || searchParams.has('g_model')) {
      return { page: 'inference', pathname, search };
    }
    const redirects = !DEFAULT_INFERENCE_REDIRECT_MISSING.some(({ key }) => searchParams.has(key));
    return {
      page: 'inference',
      pathname: redirects ? inferenceModelPath(DEFAULT_INFERENCE_MODEL_SLUG) : null,
      search,
    };
  }

  for (const page of SINGLE_PATH_PAGES) {
    if (pathname === getDashboardRoute(page).path) return { page, pathname, search };
  }

  const url = new URL(pathname, URL_BASE);
  url.search = search;
  const redirect = modelRouteRedirectUrl(url);
  const target = redirect
    ? { pathname: redirect.pathname, search: redirect.searchParams.toString() }
    : { pathname, search };
  const parsed = parseModelRoutePathname(target.pathname);
  if (!parsed || parsed.zh) return null;
  const routeModel = parsed.slug ? resolveModelRouteSlug(parsed.slug)?.route.model : undefined;
  if (parsed.slug && !routeModel) return null;

  if (parsed.tab === 'historical') return { page: 'historical', ...target };
  if (parsed.tab === 'calculator') return { page: 'calculator', ...target, routeModel };
  if (parsed.tab !== 'profit-estimator') return null;
  if (routeModel && !modelRouteAvailableForTab('profit-estimator', routeModel)) return null;
  if (profitRouteParams(target.pathname) === null) return null;
  return {
    page: 'profit-estimator',
    ...target,
    routeModel: routeModel ?? defaultRouteModel('profit-estimator'),
  };
}

/**
 * Warms the React Query data an InferenceX dashboard page loads on mount. Returns false for any
 * other path. The key derivation loads on first use so site-wide nav links stay light.
 */
export function prefetchInferenceRouteData(
  queryClient: QueryClient,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const route = resolveInferenceRoute(pathname, searchParams);
  if (!route) return false;
  import('./inference-route-warm')
    .then(({ warmInferenceRoute }) => warmInferenceRoute(queryClient, route))
    .catch(() => {});
  return true;
}
