import { LIFECYCLE_DEFAULTS } from '@/components/calculator/lifecycle';
import { dashboardRouteForPathname, getDashboardRoute } from '@/lib/routing/dashboard-routes';
import { routeModelForPathname } from '@/lib/routing/model-routes';
import { replaceClientPathname } from '@/lib/routing/client-navigation';
import { getInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import {
  PROFIT_ROUTE_PARAMS,
  profitRouteParams,
  profitRoutePathname,
  profitRouteSearch,
} from '@/lib/routing/profit-estimator-routes';

const URL_STATE_KEYS = [
  'g_model',
  'g_rundate',
  'g_runid',
  'g_tco',
  'i_seq',
  'i_prec',
  'i_metric',
  'i_revenue',
  'i_pctl',
  'i_mstat',
  'i_tokens',
  'i_pbview',
  'i_pbpoint',
  'i_xmetric',
  'i_e2e_xmetric',
  'i_xmode',
  'i_scale',
  'i_gpus',
  'i_dates',
  'i_dstart',
  'i_dend',
  'i_optimal',
  'i_best',
  'i_label',
  'i_nolabel',
  'i_hc',
  'i_log',
  'i_legend',
  'i_advlabel',
  'i_conclabel',
  'i_offloadlabel',
  'i_gradlabel',
  'i_frontier',
  'i_linelabel',
  'i_active',
  'i_vendor',
  'i_fw',
  'i_disagg',
  'i_spec',
  'i_power',
  'i_topology',
  'i_ptlines',
  'i_ptaxis',
  'i_ptwindow',
  'i_ptfocus',
  'i_ptutility',
  'i_ptraw',
  'i_ptconc',
  'i_rulers',
  'i_pcompare',
  'i_overview_current',
  'i_overview_baseline',
  'e_rundate',
  'e_bench',
  'e_hc',
  'e_labels',
  'e_legend',
  'e_active',
  'r_range',
  'r_pct',
  'r_hc',
  'r_legend',
  'r_active',
  'c_mw',
  'c_costcap',
  'c_price',
  'c_oprice',
  'c_ramp',
  'c_cache',
  'c_ly',
  'c_mtbi',
  'c_rec',
  'c_life',
  'c_power',
  'c_ivmin',
  'c_ttft',
  'c_cfg',
  'c_recipe',
  'c_ivtarget',
  'c_chmode',
] as const;

export type UrlStateKey = (typeof URL_STATE_KEYS)[number];
export type UrlStateParams = Partial<Record<UrlStateKey, string>>;

export const DEFAULT_Y_AXIS_METRIC = 'y_tokensPerDollarH';

export const DEFAULT_FLEET_MW = '10';
export const DEFAULT_LIFECYCLE_RAMP_MONTHS = String(LIFECYCLE_DEFAULTS.rampMonths);

export const PARAM_DEFAULTS: Record<UrlStateKey, string> = {
  g_model: 'DeepSeek-V4-Pro',
  g_rundate: '',
  g_runid: '',
  g_tco: 'internal',
  i_seq: '',
  i_prec: '',
  i_metric: '',
  i_revenue: 'normalized',
  i_pctl: 'p90',
  i_mstat: 'median',
  i_tokens: 'total',
  i_pbview: 'area',
  i_pbpoint: '',
  i_xmetric: 'p90_ttft',
  i_e2e_xmetric: 'p90_ttft',
  i_xmode: '',
  i_scale: 'auto',
  i_gpus: '',
  i_dates: '',
  i_dstart: '',
  i_dend: '',
  i_optimal: '',
  i_best: '',
  i_label: '',
  i_nolabel: '',
  i_hc: '',
  i_log: '',
  i_legend: '',
  i_advlabel: '',
  i_conclabel: '',
  i_offloadlabel: '1',
  i_gradlabel: '',
  i_frontier: '',
  i_linelabel: '',
  i_active: '',
  i_vendor: '',
  i_fw: '',
  i_disagg: '',
  i_spec: '',
  i_power: '',
  i_topology: '',
  i_ptlines: '',
  i_ptaxis: '',
  i_ptwindow: '',
  i_ptfocus: '',
  i_ptutility: '',
  i_ptraw: '',
  i_ptconc: '',
  i_rulers: '',
  i_pcompare: '',
  i_overview_current: '',
  i_overview_baseline: '',
  e_rundate: '',
  e_bench: '',
  e_hc: '',
  e_labels: '',
  e_legend: '',
  e_active: '',
  r_range: 'last-3-months',
  r_pct: '',
  r_hc: '',
  r_legend: '',
  r_active: '',
  c_mw: DEFAULT_FLEET_MW,
  c_costcap: '',
  c_price: '',
  c_oprice: '',
  c_life: '',
  c_power: 'provisioned',
  c_ivmin: '',
  c_ttft: '',
  c_cfg: '',
  c_recipe: '',
  c_ivtarget: '',
  c_chmode: '',
  c_ly: '',
  c_ramp: DEFAULT_LIFECYCLE_RAMP_MONTHS,
  c_cache: '10',
  c_mtbi: '24',
  c_rec: '12',
};

const currentState: Record<string, string> = {};

const _initialParams: UrlStateParams = {};
const explicitUrlParams: UrlStateParams = {};
if (typeof window !== 'undefined') {
  const searchParams = profitRouteSearch(window.location.pathname, window.location.search);
  for (const key of URL_STATE_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) {
      _initialParams[key] = value;
      explicitUrlParams[key] = value;
      currentState[key] = value;
    }
  }
}

export function readUrlParams(): UrlStateParams {
  flushPendingParams();
  return _initialParams;
}

export function refreshUrlParams(): UrlStateParams {
  if (typeof window === 'undefined') return _initialParams;
  flushPendingParams();
  const searchParams = profitRouteSearch(window.location.pathname, window.location.search);
  const onProfitRoute = profitRouteParams(window.location.pathname) !== null;
  for (const key of URL_STATE_KEYS) {
    delete explicitUrlParams[key];
    const value = searchParams.get(key);
    if (value === null) {
      if (onProfitRoute) {
        delete _initialParams[key];
        delete currentState[key];
      }
      continue;
    }
    explicitUrlParams[key] = value;
    _initialParams[key] = value;
    currentState[key] = value;
  }
  return _initialParams;
}

let lastRefreshedPathname: string | null = null;

export function refreshUrlParamsOnNavigation(pathname: string): boolean {
  if (lastRefreshedPathname === pathname) return false;
  lastRefreshedPathname = pathname;
  refreshUrlParams();
  return true;
}

export function hasExplicitUrlParam(key: UrlStateKey): boolean {
  return explicitUrlParams[key] !== undefined;
}

export function hasAnyUrlParams(): boolean {
  if (typeof window === 'undefined') return false;
  const searchParams = new URLSearchParams(window.location.search);
  return URL_STATE_KEYS.some((key) => searchParams.has(key));
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingParams: UrlStateParams = {};

export function writeUrlParams(params: UrlStateParams): void {
  Object.assign(pendingParams, params);

  if (writeTimer !== null) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    flushPendingParams();
    syncProfitRoute();
  }, 150);
}

function syncProfitRoute(): void {
  if (typeof window === 'undefined') return;
  const params = collectTabParams();
  const pathname = profitRoutePathname(window.location.pathname, params);
  if (pathname === null) return;
  replaceClientPathname(pathname, [
    ...URL_STATE_KEYS,
    'percentile',
    ...[...new URLSearchParams(window.location.search).keys()].filter((key) =>
      UNOFFICIAL_RUN_PARAM_RE.test(key),
    ),
  ]);
}

function flushPendingParams(): void {
  if (Object.keys(pendingParams).length === 0) return;

  for (const [key, value] of Object.entries(pendingParams)) {
    const urlKey = key as UrlStateKey;
    const defaultValue = PARAM_DEFAULTS[urlKey];

    if (value === undefined || value === defaultValue) {
      delete currentState[urlKey];
      delete _initialParams[urlKey];
    } else {
      currentState[urlKey] = value;
      _initialParams[urlKey] = value;
    }
  }

  pendingParams = {};
  writeTimer = null;
}

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/iu;

function collectTabParams(): URLSearchParams {
  flushPendingParams();

  const route = dashboardRouteForPathname(window.location.pathname);
  const prefixes = route?.shareParamScopes ?? getDashboardRoute('inference').shareParamScopes;
  const filtered = new URLSearchParams();
  const onProfitRoute = profitRouteParams(window.location.pathname) !== null;
  const profitKeys: readonly string[] = Object.values(PROFIT_ROUTE_PARAMS);
  for (const [key, value] of Object.entries(currentState)) {
    if (
      prefixes.some((p) => key.startsWith(p)) &&
      (!onProfitRoute || key === 'g_model' || profitKeys.includes(key))
    ) {
      filtered.set(key, value);
    }
  }

  // Bare inference now has a different entry default than the retained legacy model.
  if (/^(?:\/zh)?\/inference\/?$/u.test(window.location.pathname)) {
    const model = getInferenceNavigationModel();
    if (model) filtered.set('g_model', model);
  }

  if (routeModelForPathname(window.location.pathname) === filtered.get('g_model')) {
    filtered.delete('g_model');
  }

  const liveParams = profitRouteSearch(window.location.pathname, window.location.search);
  for (const [key, value] of liveParams) {
    if (UNOFFICIAL_RUN_PARAM_RE.test(key) && value) {
      filtered.set('unofficialruns', value);
      break;
    }
  }

  return filtered;
}

export function buildShareUrl(): string {
  const params = collectTabParams();
  const profitPath = profitRoutePathname(window.location.pathname, params);
  if (profitPath !== null) {
    return `${window.location.origin}${profitPath}${window.location.hash}`;
  }
  const search = params.toString();
  return `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

export function currentChartSearch(): string {
  if (typeof window === 'undefined') return '';
  return collectTabParams().toString();
}

export function rememberChartStateInUrl(): string {
  if (typeof window === 'undefined') return '';
  if (profitRouteParams(window.location.pathname) !== null) {
    syncProfitRoute();
    return collectTabParams().toString();
  }
  const { pathname, hash, search: liveSearch } = window.location;
  const chartParams = collectTabParams();

  const merged = new URLSearchParams(liveSearch);
  for (const key of URL_STATE_KEYS) merged.delete(key);
  const unofficialKeys: string[] = [];
  for (const key of merged.keys()) {
    if (UNOFFICIAL_RUN_PARAM_RE.test(key)) unofficialKeys.push(key);
  }
  for (const key of unofficialKeys) merged.delete(key);
  for (const [key, value] of chartParams) merged.set(key, value);

  const search = merged.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${search ? `?${search}` : ''}${hash}`,
  );
  return chartParams.toString();
}

export function chartStateHref(overrides: Record<string, string>): string {
  const { origin, pathname, hash, search } = window.location;
  const merged = new URLSearchParams(search);
  for (const key of URL_STATE_KEYS) merged.delete(key);
  const staleRunKeys = [...merged.keys()].filter((key) => UNOFFICIAL_RUN_PARAM_RE.test(key));
  for (const key of staleRunKeys) merged.delete(key);
  for (const [key, value] of collectTabParams()) merged.set(key, value);
  for (const [key, value] of Object.entries(overrides)) merged.set(key, value);
  const query = merged.toString();
  return `${origin}${pathname}${query ? `?${query}` : ''}${hash}`;
}

export function withChartState(href: string): string {
  const search = currentChartSearch();
  if (!search) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${search}`;
}
