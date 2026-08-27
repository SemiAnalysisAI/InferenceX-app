/**
 * @file url-state.ts
 * @description Utility for reading chart control state from URL query parameters on first load,
 * then keeping state in memory. Share links are built on-demand via buildShareUrl().
 *
 * URL params are prefixed by scope:
 *   g_ = global state (model, run date/id)
 *   i_ = inference chart
 *   e_ = evaluation chart
 *   r_ = reliability chart
 *   c_ = TCO calculator
 *
 * Only non-default values are written to keep URLs short.
 */
import { dashboardRouteForPathname, getDashboardRoute } from '@/lib/dashboard-routes';
import { routeModelForPathname } from '@/lib/model-routes';

// All known share-link parameter keys
const URL_STATE_KEYS = [
  // Global
  'g_model',
  'g_rundate',
  'g_runid',
  // Inference
  'i_seq',
  'i_prec',
  'i_metric',
  'i_pctl',
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
  // Legacy alias of `i_label` with inverted semantics — read-only on load so
  // pre-rename share links (?i_nolabel=1) keep hiding point labels even if the
  // default flips again later. New code only writes `i_label`.
  'i_nolabel',
  'i_hc',
  'i_log',
  'i_legend',
  'i_advlabel',
  'i_conclabel',
  'i_gradlabel',
  'i_linelabel',
  'i_active',
  // Quick filters (vendor / framework / deployment / mtp-stp).
  // `i_disagg` keeps its historical name for shared-link compatibility.
  'i_vendor',
  'i_fw',
  'i_disagg',
  'i_spec',
  // Exact serving-envelope pair behind an Overview 30-day comparison cell.
  'i_overview_current',
  'i_overview_baseline',
  // Evaluation
  'e_rundate',
  'e_bench',
  'e_hc',
  'e_labels',
  'e_legend',
  'e_active',
  // Reliability
  'r_range',
  'r_pct',
  'r_hc',
  'r_legend',
  'r_active',
  // Calculator (fleet planner)
  'c_mw',
  'c_costcap',
  // Calculator (fleet lifecycle) — token price and the ramp/interrupt/horizon
  // assumptions (the throughput steps are measured; those four are not), plus
  // which metric the chart plots.
  'c_price',
  // Output-token price. Input keeps `c_price`, so a link written before the
  // split still seeds the field it always seeded.
  'c_oprice',
  'c_ramp',
  // What a cached input token sells for, as a % of the price. Agentic only —
  // fixed sequences record no cache hits for it to apply to.
  'c_cache',
  'c_ly',
  'c_mtbi',
  'c_rec',
  'c_life',
] as const;

export type UrlStateKey = (typeof URL_STATE_KEYS)[number];
export type UrlStateParams = Partial<Record<UrlStateKey, string>>;

/** Default values for each parameter. Params matching their default are omitted from share URLs. */
/**
 * Dashboard default y-axis: total tokens purchasable per $1 USD at owning
 * Neocloud TCO, so the dashboard leads with the economics rather than raw
 * throughput. `?i_metric=` still wins, so existing shared links are unaffected.
 *
 * Lives here rather than in `InferenceContext` because `PARAM_DEFAULTS` below
 * strips any value equal to the default from share links. If the two drifted,
 * a link captured on the *other* metric would be written without `i_metric`
 * and reopen on this one.
 */
export const DEFAULT_Y_AXIS_METRIC = 'y_tokensPerDollarN';

/** Shared defaults for the fleet lifecycle and calculator MW controls. */
export const DEFAULT_FLEET_MW = '10';
export const DEFAULT_LIFECYCLE_RAMP_MONTHS = '0.5';

export const PARAM_DEFAULTS: Record<UrlStateKey, string> = {
  g_model: 'DeepSeek-V4-Pro',
  g_rundate: '',
  g_runid: '',
  // No strippable default: per-route `initialSequence` seeds (e.g. the /compare
  // pages) make the no-param resolution route-dependent, so stripping '8k/1k'
  // (the global default) would revert an explicit 8K/1K pick back to the route's
  // seeded scenario on reload. Empty means the resolved scenario is ALWAYS
  // written explicitly (effectiveSequence is never ''), so a shared/reloaded
  // link keeps whatever the user picked. The no-param case still resolves via
  // availability.
  i_seq: '',
  // No strippable default: precision is only written to the URL once chosen
  // explicitly, so an explicit FP4 selection must survive (not be stripped as a
  // "default") or it would silently revert to the per-model auto default on reload.
  i_prec: '',
  i_metric: DEFAULT_Y_AXIS_METRIC,
  i_pctl: 'p90',
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
  i_gradlabel: '',
  i_linelabel: '',
  i_active: '',
  i_vendor: '',
  i_fw: '',
  i_disagg: '',
  i_spec: '',
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
  // Empty means "use the component's default", which for these two is derived
  // rather than constant: the price from the cheapest visible chip's break-even,
  // the horizon from the measured run window. A non-empty default here would be
  // stripped from share links and silently re-derived on load.
  c_price: '',
  c_oprice: '',
  c_life: '',
  // Empty means the default y metric (margin).
  c_ly: '',
  c_ramp: DEFAULT_LIFECYCLE_RAMP_MONTHS,
  c_cache: '10',
  c_mtbi: '24',
  c_rec: '12',
};

/** In-memory store of current param values (kept in sync via writeUrlParams). */
const currentState: Record<string, string> = {};

// On module load: snapshot share-link params from the URL.
// Cleanup is deferred so it runs after Next.js hydration finishes.
const _initialParams: UrlStateParams = {};
const explicitUrlParams: UrlStateParams = {};
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  for (const key of URL_STATE_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) {
      _initialParams[key] = value;
      explicitUrlParams[key] = value;
      currentState[key] = value;
    }
  }
  // Defer cleanup so the Next.js router doesn't overwrite it during hydration
  setTimeout(() => {
    const sp = new URLSearchParams(window.location.search);
    for (const key of URL_STATE_KEYS) {
      sp.delete(key);
    }
    const s = sp.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${s ? `?${s}` : ''}${window.location.hash}`,
    );
  }, 0);
}

/** Returns the current share-link state, flushing pending writes for provider remounts. */
export function readUrlParams(): UrlStateParams {
  flushPendingParams();
  return _initialParams;
}

/**
 * Re-read share-link params from the live URL, replacing the load-time
 * snapshot.
 *
 * The snapshot above is captured once per page load, which is correct for a
 * hard navigation but wrong for a client-side one: a soft transition to
 * `/inference?g_model=…` does not remount the provider, so every reader kept
 * seeing the params of the page the user came FROM (usually none). Callers
 * must only invoke this on a real router navigation — self-writes go through
 * `history.replaceState`, which deliberately does not, so re-reading after one
 * of those would fight the user's own filter changes.
 *
 * Also mirrors into `currentState` so the next share-link write starts from
 * what the URL actually asked for.
 */
export function refreshUrlParams(): UrlStateParams {
  if (typeof window === 'undefined') return _initialParams;
  flushPendingParams();
  const searchParams = new URLSearchParams(window.location.search);
  for (const key of URL_STATE_KEYS) {
    delete explicitUrlParams[key];
    const value = searchParams.get(key);
    if (value === null) continue;
    explicitUrlParams[key] = value;
    _initialParams[key] = value;
    currentState[key] = value;
  }
  return _initialParams;
}

/**
 * Pathname of the last navigation whose params were pulled into the snapshot.
 * Module-level (not a hook ref) so only the FIRST `useUrlState` consumer to
 * render after a navigation does the work: a component that mounts later on
 * the same path must not re-import the URL over filter changes the user has
 * made since.
 */
let lastRefreshedPathname: string | null = null;

/**
 * Refresh the snapshot once per client-side navigation.
 *
 * Providers read their initial state through `getUrlParam` during render, so
 * the snapshot has to be current BEFORE they initialise. `useUrlState` calls
 * this while rendering, which puts it ahead of every provider below the
 * component that called it first (React renders top-down), and ahead of the
 * mount effects that read `i_gpus` and friends.
 *
 * Returns whether a refresh actually happened, which is what the unit tests
 * assert on.
 */
export function refreshUrlParamsOnNavigation(pathname: string): boolean {
  if (lastRefreshedPathname === pathname) return false;
  lastRefreshedPathname = pathname;
  refreshUrlParams();
  return true;
}

/** Whether the current navigation explicitly supplied a share-link parameter. */
export function hasExplicitUrlParam(key: UrlStateKey): boolean {
  return explicitUrlParams[key] !== undefined;
}

/** Check whether the current URL has any share-link params. */
export function hasAnyUrlParams(): boolean {
  if (typeof window === 'undefined') return false;
  const searchParams = new URLSearchParams(window.location.search);
  return URL_STATE_KEYS.some((key) => searchParams.has(key));
}

// Debounce timer for batching rapid state changes
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingParams: UrlStateParams = {};

/**
 * Write share-link params to the in-memory store (debounced).
 * Params matching their default value are removed.
 */
export function writeUrlParams(params: UrlStateParams): void {
  // merge into pending batch
  Object.assign(pendingParams, params);

  if (writeTimer !== null) {
    clearTimeout(writeTimer);
  }

  writeTimer = setTimeout(() => {
    flushPendingParams();
  }, 150);
}

/** Immediately flush any pending param writes into the in-memory store. */
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

/**
 * Build a share URL containing only the params relevant to the current tab.
 * Flushes pending writes first so state is up-to-date.
 *
 * `unofficialrun` / `unofficialruns` is not part of the in-memory `currentState`
 * (it's owned by UnofficialRunProvider and written to the address bar via
 * history.pushState on dismiss/load). We read it straight from the live URL so
 * a shared link reflects the currently-loaded set of unofficial runs, including
 * after per-run dismissals.
 */
const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/iu;

/**
 * Current in-memory state for the active route, plus any unofficial-run IDs
 * in the address bar, as a `URLSearchParams`. Flushes pending writes first so
 * the caller sees the newest filter change rather than the one before it.
 */
function collectTabParams(): URLSearchParams {
  flushPendingParams();

  const route = dashboardRouteForPathname(window.location.pathname);
  // Compare and other chart routes share inference controls but deliberately
  // stay outside the dashboard registry.
  const prefixes = route?.shareParamScopes ?? getDashboardRoute('inference').shareParamScopes;
  const filtered = new URLSearchParams();
  for (const [key, value] of Object.entries(currentState)) {
    if (prefixes.some((p) => key.startsWith(p))) {
      filtered.set(key, value);
    }
  }

  // On per-model routes (/calculator/<slug>, /historical/<slug>) the pathname
  // already encodes the model, so a matching g_model would be redundant in the
  // share link. A mismatch (possible mid-transition) is kept — explicit
  // g_model wins over the path on load, so the link still opens correctly.
  if (routeModelForPathname(window.location.pathname) === filtered.get('g_model')) {
    filtered.delete('g_model');
  }

  // Carry over any unofficial-run IDs currently reflected in the address bar.
  // Only the first match is forwarded and it's always emitted under the plural
  // `unofficialruns` key — the canonical form the app writes on dismiss/load
  // and the one we want shared links to use going forward.
  const liveParams = new URLSearchParams(window.location.search);
  for (const [key, value] of liveParams) {
    if (UNOFFICIAL_RUN_PARAM_RE.test(key) && value) {
      filtered.set('unofficialruns', value);
      break;
    }
  }

  return filtered;
}

export function buildShareUrl(): string {
  const search = collectTabParams().toString();
  return `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
}

/**
 * The chart state this page would share, as a query string (no leading `?`).
 * Empty when every value is at its default.
 */
export function currentChartSearch(): string {
  if (typeof window === 'undefined') return '';
  return collectTabParams().toString();
}

/**
 * Write the chart state into the CURRENT history entry, so Back restores it.
 *
 * Filter changes only ever reach the in-memory `currentState` — the address bar
 * is deliberately stripped clean after load — so the entry the browser returns
 * to is a bare `/inference` that rebuilds from defaults. Detail-page links are
 * plain `<a href>` (they must support open-in-new-tab), i.e. full-document
 * navigations that also destroy this module, so the URL is the only channel
 * that survives. Call this immediately before navigating away from a chart.
 *
 * `history.state` is passed straight through so the Next router's own entry
 * bookkeeping is not clobbered.
 */
export function rememberChartStateInUrl(): string {
  if (typeof window === 'undefined') return '';
  const { pathname, hash, search: liveSearch } = window.location;
  const chartParams = collectTabParams();

  // Start from whatever is already in the address bar so params this module
  // does not own (campaign tags and the like) survive the rewrite, then layer
  // the chart state on top. Both unofficial-run spellings are cleared first —
  // `collectTabParams` re-emits the canonical plural form.
  const merged = new URLSearchParams(liveSearch);
  for (const key of URL_STATE_KEYS) merged.delete(key);
  const unofficialKeys: string[] = [];
  for (const key of merged.keys()) {
    if (UNOFFICIAL_RUN_PARAM_RE.test(key)) unofficialKeys.push(key);
  }
  // Deleting inside the iteration above would skip entries.
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

/**
 * Append the current chart state to an outbound in-app href, so the page it
 * opens can link back to the chart the user left. Used for the agentic
 * point-detail links, which are full-document navigations.
 */
export function withChartState(href: string): string {
  const search = currentChartSearch();
  if (!search) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${search}`;
}
