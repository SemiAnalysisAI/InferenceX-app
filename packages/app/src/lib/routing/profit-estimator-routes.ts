import type { Model } from '@/lib/catalog/data-mappings';
import {
  defaultRouteModel,
  modelRouteSlug,
  parseModelRoutePathname,
  resolveModelRouteSlug,
} from './model-routes';

export type ProfitRouteTab = 'profit-estimator' | 'profit-estimator-per-gigawatt';

/** Public path vocabulary; query keys remain an internal adapter for shared controls. */
export const PROFIT_ROUTE_PARAMS = {
  target: 'c_ivtarget',
  'cache-hit-mode': 'c_chmode',
  power: 'c_power',
  'tco-basis': 'g_tco',
  date: 'g_rundate',
  run: 'g_runid',
  precision: 'i_prec',
  chips: 'i_gpus',
  dates: 'i_dates',
  start: 'i_dstart',
  end: 'i_dend',
  'unofficial-runs': 'unofficialruns',
} as const;

export function isProfitRouteTab(tab: string): tab is ProfitRouteTab {
  return tab === 'profit-estimator' || tab === 'profit-estimator-per-gigawatt';
}

/** Next route params are already decoded. Reject unknown/duplicate keys and broken pairs. */
export function parseProfitRouteFilters(filters: readonly string[]): URLSearchParams | null {
  if (filters.length % 2 !== 0) return null;
  const result = new URLSearchParams();
  const seen = new Set<string>();
  for (let i = 0; i < filters.length; i += 2) {
    const name = filters[i];
    const value = filters[i + 1];
    if (!value || [...value].some((char) => char < ' ' || char === '\u007F') || seen.has(name))
      return null;
    seen.add(name);
    // Read retired segments only to redirect old links to the P90-only route.
    if (name === 'percentile') continue;
    if (!Object.hasOwn(PROFIT_ROUTE_PARAMS, name)) return null;
    const key = PROFIT_ROUTE_PARAMS[name as keyof typeof PROFIT_ROUTE_PARAMS];
    result.set(key, value);
  }
  return result;
}

/** Read route state without involving React, including on the server. */
export function profitRouteParams(pathname: string): URLSearchParams | null {
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed || !isProfitRouteTab(parsed.tab)) return null;
  const parts = pathname.split(/[?#]/u, 1)[0].split('/').filter(Boolean);
  const filters = parts.slice(parsed.zh ? 3 : 2);
  try {
    return parseProfitRouteFilters(filters.map(decodeURIComponent));
  } catch {
    return null;
  }
}

/** Route state wins over legacy queries; the path model wins on filtered routes. */
export function profitRouteSearch(pathname: string, search: string): URLSearchParams {
  const result = new URLSearchParams(search);
  const route = profitRouteParams(pathname);
  if (!route) return result;
  result.delete('i_pctl');
  result.delete('percentile');
  for (const [key, value] of route) result.set(key, value);
  const parsed = parseModelRoutePathname(pathname);
  if (route.size > 0 && parsed?.slug) {
    const model = resolveModelRouteSlug(parsed.slug)?.route.model;
    if (model) result.set('g_model', model);
  }
  return result;
}

/** Stable order, model in the path, and no query-string state. */
export function profitRoutePathname(pathname: string, params: URLSearchParams): string | null {
  const parsed = parseModelRoutePathname(pathname);
  if (!parsed || !isProfitRouteTab(parsed.tab)) return null;
  const pathModel = parsed.slug ? resolveModelRouteSlug(parsed.slug)?.route.model : undefined;
  const model =
    (params.get('g_model') as Model | null) ?? pathModel ?? defaultRouteModel(parsed.tab);
  const slug = modelRouteSlug(model);
  if (!slug) return null;
  const filters: string[] = [];
  for (const [name, key] of Object.entries(PROFIT_ROUTE_PARAMS)) {
    const value = params.get(key);
    if (value) filters.push(name, encodeURIComponent(value));
  }
  const base = `${parsed.zh ? '/zh' : ''}/${parsed.tab}`;
  // Leave a bare default page bare until a model or a filter is selected.
  if (!parsed.slug && model === defaultRouteModel(parsed.tab) && filters.length === 0) return base;
  return `${base}/${slug}${filters.length > 0 ? `/${filters.join('/')}` : ''}`;
}

/** Overlay controls own their run list; update it without leaving a stale path value. */
export function setProfitRouteUnofficialRuns(url: URL, runIds: readonly string[]): void {
  const params = profitRouteSearch(url.pathname, url.search);
  const oldKeys = [...params.keys()].filter((key) => /^unofficialruns?$/iu.test(key));
  for (const key of oldKeys) params.delete(key);
  if (runIds.length > 0) params.set('unofficialruns', runIds.join(','));
  const pathname = profitRoutePathname(url.pathname, params);
  if (pathname === null) return;
  url.pathname = pathname;
  const queryKeys = [...url.searchParams.keys()].filter((key) => /^unofficialruns?$/iu.test(key));
  for (const key of queryKeys) url.searchParams.delete(key);
}
