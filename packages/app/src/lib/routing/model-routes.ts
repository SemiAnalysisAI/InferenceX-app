import {
  COMPARE_MODEL_ALIASES,
  COMPARE_MODEL_SLUGS,
  type CompareModelSlug,
} from '@/lib/compare/compare-slug';
import { isModelVisible, Model, MODEL_OPTIONS } from '@/lib/catalog/data-mappings';

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

export const DEFAULT_ROUTE_MODEL: Model = Model.DeepSeek_V4_Pro;

const MODEL_ROUTE_TAB_DEFAULT_MODEL: Record<ModelRouteTab, Model> = {
  calculator: DEFAULT_ROUTE_MODEL,
  historical: DEFAULT_ROUTE_MODEL,
  'profit-estimator': Model.Kimi_K3,
  'profit-estimator-per-gigawatt': Model.Kimi_K3,
};

export function defaultRouteModel(tab: ModelRouteTab): Model {
  return MODEL_ROUTE_TAB_DEFAULT_MODEL[tab];
}

const PROFIT_ESTIMATOR_MODELS: readonly Model[] = [
  Model.Kimi_K3,
  Model.GLM_5_2,
  Model.MiniMax_M3,
  Model.DeepSeek_V4_Pro,
  Model.DeepSeek_V4_1_Flash,
];
const MODEL_ROUTE_TAB_MODELS: Partial<Record<ModelRouteTab, readonly Model[]>> = {
  'profit-estimator': PROFIT_ESTIMATOR_MODELS,
  'profit-estimator-per-gigawatt': PROFIT_ESTIMATOR_MODELS,
};

export function modelRoutesForTab(tab: ModelRouteTab): ModelRoute[] {
  const allowed = MODEL_ROUTE_TAB_MODELS[tab];
  return MODEL_ROUTES.filter(
    (route) => isModelVisible(route.model) && (!allowed || allowed.includes(route.model)),
  );
}

export function modelRouteAvailableForTab(tab: ModelRouteTab, model: Model): boolean {
  return MODEL_ROUTE_TAB_MODELS[tab]?.includes(model) ?? true;
}

export interface ModelRoute {
  slug: string;
  model: Model;
  seoName: string;
  label: string;
}

function compareEntryForModel(model: Model): CompareModelSlug | undefined {
  return COMPARE_MODEL_SLUGS.find((entry) => entry.displayName === model);
}

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
  isAlias: boolean;
}

export function resolveModelRouteSlug(slug: string): ResolvedModelRoute | null {
  const lower = slug.toLowerCase();
  const canonical = COMPARE_MODEL_ALIASES[lower] ?? lower;
  const route = ROUTE_BY_SLUG.get(canonical);
  if (!route) return null;
  return { route, isAlias: canonical !== slug };
}

export function modelRouteSlug(model: Model): string | null {
  return ROUTE_BY_MODEL.get(model)?.slug ?? null;
}

export function modelRoutePath(tab: ModelRouteTab, slug: string): string {
  return `${MODEL_ROUTE_TAB_PATHS[tab]}/${slug}`;
}

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
  zh: boolean;
  slug: string | null;
}

export function parseModelRoutePathname(pathname: string): ParsedModelRoutePathname | null {
  const barePath = pathname.split(/[?#]/u, 1)[0] || '/';
  const zh = barePath === '/zh' || barePath.startsWith('/zh/');
  const enPath = zh ? barePath.slice('/zh'.length) || '/' : barePath;
  for (const tab of MODEL_ROUTE_TABS) {
    const tabPath = MODEL_ROUTE_TAB_PATHS[tab];
    if (enPath === tabPath) return { tab, zh, slug: null };
    if (enPath.startsWith(`${tabPath}/`)) {
      const rest = enPath.slice(tabPath.length + 1);
      if (!rest) return null;
      const [slug, ...filters] = rest.split('/');
      if (filters.length > 0) {
        if (tab !== 'profit-estimator' && tab !== 'profit-estimator-per-gigawatt') return null;
        if (filters.length % 2 !== 0 || filters.some((part) => !part)) return null;
      }
      return { tab, zh, slug };
    }
  }
  return null;
}

export function routeModelForPathname(pathname: string | null | undefined): Model | null {
  if (!pathname) return null;
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed?.slug) return null;
  return resolveModelRouteSlug(parsed.slug)?.route.model ?? null;
}

export function modelRoutePathnameRewrite(pathname: string, model: Model): string | null {
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed) return null;
  if (parsed.slug && !resolveModelRouteSlug(parsed.slug)) return null;
  const slug = modelRouteSlug(model);
  if (!slug) return null;
  if (parsed.slug === slug) return null;
  if (!parsed.slug && model === defaultRouteModel(parsed.tab)) return null;
  const suffix =
    parsed.tab === 'profit-estimator' || parsed.tab === 'profit-estimator-per-gigawatt'
      ? pathname
          .split('/')
          .slice(parsed.zh ? 4 : 3)
          .join('/')
      : '';
  const enPath = `${modelRoutePath(parsed.tab, slug)}${suffix ? `/${suffix}` : ''}`;
  return parsed.zh ? `/zh${enPath}` : enPath;
}
