import {
  COMPARE_MODEL_ALIASES,
  COMPARE_MODEL_SLUGS,
  type CompareModelSlug,
} from '@/lib/compare-slug';
import { Model, MODEL_OPTIONS } from '@/lib/data-mappings';

// ---------------------------------------------------------------------------
// Per-model dashboard routes: /calculator/<model>, /historical/<model>,
// /profit-estimator/<model>, and /profit-estimator-per-gigawatt/<model>
// ---------------------------------------------------------------------------
//
// The bare /calculator and /historical tabs render the DEFAULT model; the
// `[model]` child routes render the same page seeded to a specific model so
// every model gets its own indexable URL (title, description, canonical, and
// hreflang all model-specific). Slugs deliberately REUSE the compare-page
// model registry (`COMPARE_MODEL_SLUGS`) so `kimi-k3` means the same model in
// `/compare/kimi-k3-b200-vs-mi355x`, `/calculator/kimi-k3`, and
// `/historical/kimi-k3` — one slug vocabulary across the whole site.
//
// Unlike compare (whose slugs are finer-grained than the display dropdown,
// e.g. distinct kimi-k25/k26 DB buckets), these routes address the dashboard's
// display-grouped model selector, so exactly one canonical slug exists per
// visible `Model` option. Aliases (`kimi`, `glm-5`, …) 308-redirect to the
// canonical slug, mirroring compare behavior.

/** Dashboard tabs that expose per-model child routes. */
export const MODEL_ROUTE_TABS = [
  'calculator',
  'historical',
  'profit-estimator',
  'profit-estimator-per-gigawatt',
] as const;
export type ModelRouteTab = (typeof MODEL_ROUTE_TABS)[number];

const MODEL_ROUTE_TAB_PATHS: Record<ModelRouteTab, `/${string}`> = {
  calculator: '/calculator',
  historical: '/historical',
  'profit-estimator': '/profit-estimator',
  'profit-estimator-per-gigawatt': '/profit-estimator-per-gigawatt',
};

/**
 * Model the bare tab route renders when no slug (and no `?g_model=`) is
 * present. Must stay in lockstep with `PARAM_DEFAULTS.g_model` in
 * `url-state.ts` and the `GlobalFilterProvider` initializer — the pathname
 * rewrite below treats a bare path as this model, so drift would rewrite the
 * URL on plain page loads. `model-routes.test.ts` pins the invariant.
 */
export const DEFAULT_ROUTE_MODEL: Model = Model.DeepSeek_V4_Pro;

/**
 * Model each bare tab route renders. Calculator and historical follow the
 * app-wide default; the profit estimators are pinned to agentic traces and open
 * on Kimi K3, the model that workload is benchmarked most widely on. The page
 * component seeds `GlobalFilterProvider` with the same model, and
 * `model-routes.test.ts` pins that agreement.
 */
const MODEL_ROUTE_TAB_DEFAULT_MODEL: Record<ModelRouteTab, Model> = {
  calculator: DEFAULT_ROUTE_MODEL,
  historical: DEFAULT_ROUTE_MODEL,
  'profit-estimator': Model.Kimi_K3,
  'profit-estimator-per-gigawatt': Model.Kimi_K3,
};

/** Model the bare `tab` route shows; its slugged page canonicalizes to the bare path. */
export function defaultRouteModel(tab: ModelRouteTab): Model {
  return MODEL_ROUTE_TAB_DEFAULT_MODEL[tab];
}

/**
 * Tabs that expose only a subset of `MODEL_ROUTES`. The profit estimators
 * serve the agentic models whose coverage spans every SKU we price: Kimi K3
 * (the default) and GLM 5.2/5.3. Other slugs 404 there and stay out of the
 * sitemap. Tabs absent from this map offer every model.
 */
const PROFIT_ESTIMATOR_MODELS: readonly Model[] = [Model.Kimi_K3, Model.GLM_5_2];
const MODEL_ROUTE_TAB_MODELS: Partial<Record<ModelRouteTab, readonly Model[]>> = {
  'profit-estimator': PROFIT_ESTIMATOR_MODELS,
  'profit-estimator-per-gigawatt': PROFIT_ESTIMATOR_MODELS,
};

/** Routes a tab actually serves, in `MODEL_ROUTES` order. */
export function modelRoutesForTab(tab: ModelRouteTab): ModelRoute[] {
  const allowed = MODEL_ROUTE_TAB_MODELS[tab];
  return allowed ? MODEL_ROUTES.filter((route) => allowed.includes(route.model)) : MODEL_ROUTES;
}

/** Whether `tab` serves a page for `model`. */
export function modelRouteAvailableForTab(tab: ModelRouteTab, model: Model): boolean {
  return MODEL_ROUTE_TAB_MODELS[tab]?.includes(model) ?? true;
}

export interface ModelRoute {
  /** Canonical URL segment, e.g. 'kimi-k3'. Lowercase, hyphen-separated. */
  slug: string;
  /** Display-grouped dashboard model this route seeds. */
  model: Model;
  /** Natural model name for SEO titles/descriptions, e.g. 'Kimi K3'. */
  seoName: string;
  /** Human label for headers, e.g. 'Kimi K3 2.8T'. */
  label: string;
}

function compareEntryForModel(model: Model): CompareModelSlug | undefined {
  return COMPARE_MODEL_SLUGS.find((entry) => entry.displayName === model);
}

/**
 * One route per visible dashboard model. Derived (not hand-copied) from the
 * compare registry so a new model added there automatically gets calculator
 * and historical routes; the test suite fails if a `MODEL_OPTIONS` entry has
 * no compare slug to derive from.
 */
export const MODEL_ROUTES: ModelRoute[] = MODEL_OPTIONS.flatMap((model) => {
  const entry = compareEntryForModel(model);
  if (!entry) return [];
  return [{ slug: entry.slug, model, seoName: entry.seoName, label: entry.label }];
});

const ROUTE_BY_SLUG: ReadonlyMap<string, ModelRoute> = new Map(
  MODEL_ROUTES.map((route) => [route.slug, route]),
);
const ROUTE_BY_MODEL: ReadonlyMap<Model, ModelRoute> = new Map(
  MODEL_ROUTES.map((route) => [route.model, route]),
);

export interface ResolvedModelRoute {
  route: ModelRoute;
  /** True when the input was an alias or non-canonical casing — caller should
   *  308 to the canonical slug. */
  isAlias: boolean;
}

/** Resolve a URL segment (canonical slug, alias, or mixed case) to a model
 *  route. Returns null for unknown slugs. */
export function resolveModelRouteSlug(slug: string): ResolvedModelRoute | null {
  const lower = slug.toLowerCase();
  const canonical = COMPARE_MODEL_ALIASES[lower] ?? lower;
  const route = ROUTE_BY_SLUG.get(canonical);
  if (!route) return null;
  return { route, isAlias: canonical !== slug };
}

/** Canonical slug for a model, or null for models without a route (hidden). */
export function modelRouteSlug(model: Model): string | null {
  return ROUTE_BY_MODEL.get(model)?.slug ?? null;
}

/** Canonical English path for a per-model tab page, e.g. '/historical/kimi-k3'. */
export function modelRoutePath(tab: ModelRouteTab, slug: string): string {
  return `${MODEL_ROUTE_TAB_PATHS[tab]}/${slug}`;
}

/**
 * Reattach incoming search params when 308ing an alias slug to its canonical
 * path, so share-link state (g_rundate, i_seq, c_price, unofficialruns, …)
 * survives the redirect.
 */
export function pathWithSearchParams(
  path: string,
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export interface ParsedModelRoutePathname {
  tab: ModelRouteTab;
  /** True for /zh-prefixed pathnames. */
  zh: boolean;
  /** URL segment after the tab path, or null on the bare tab route. */
  slug: string | null;
}

/**
 * Parse an English or /zh pathname into its model-routed tab, if any.
 * `/calculator` → slug null; `/zh/historical/kimi-k3` → slug 'kimi-k3';
 * anything else (other tabs, deeper children) → null.
 */
export function parseModelRoutePathname(pathname: string): ParsedModelRoutePathname | null {
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const zh = barePath === '/zh' || barePath.startsWith('/zh/');
  const enPath = zh ? barePath.slice('/zh'.length) || '/' : barePath;
  for (const tab of MODEL_ROUTE_TABS) {
    const tabPath = MODEL_ROUTE_TAB_PATHS[tab];
    if (enPath === tabPath) return { tab, zh, slug: null };
    if (enPath.startsWith(`${tabPath}/`)) {
      const rest = enPath.slice(tabPath.length + 1);
      if (!rest || rest.includes('/')) return null;
      return { tab, zh, slug: rest };
    }
  }
  return null;
}

/**
 * Model implied by a model-routed pathname, or null when the pathname is not
 * a model-routed page or carries no (known) slug. Used to seed
 * `GlobalFilterProvider` so `/historical/kimi-k3` server-renders and hydrates
 * on Kimi K3 without waiting for a client effect.
 */
export function routeModelForPathname(pathname: string | null | undefined): Model | null {
  if (!pathname) return null;
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed?.slug) return null;
  return resolveModelRouteSlug(parsed.slug)?.route.model ?? null;
}

/**
 * Pathname the address bar should show for `model` while on a model-routed
 * page, or null when no rewrite is needed. Pure so the model-switch URL
 * behavior is unit-testable; the caller performs the actual
 * `history.replaceState`.
 *
 * Rules:
 * - Non-model-routed pages, unknown slugs, and slug-less models → null.
 * - Bare tab path showing the default model → stays bare (plain page loads
 *   must not rewrite the URL).
 * - Any other mismatch (model switched, alias slug, legacy `?g_model=` link
 *   resolved by the provider) → the canonical slugged path.
 */
export function modelRoutePathnameRewrite(pathname: string, model: Model): string | null {
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed) return null;
  if (parsed.slug && !resolveModelRouteSlug(parsed.slug)) return null;
  const slug = modelRouteSlug(model);
  if (!slug) return null;
  if (parsed.slug === slug) return null;
  if (!parsed.slug && model === defaultRouteModel(parsed.tab)) return null;
  const enPath = modelRoutePath(parsed.tab, slug);
  return parsed.zh ? `/zh${enPath}` : enPath;
}
