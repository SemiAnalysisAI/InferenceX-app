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
 *
 * Only non-default values are written to keep URLs short.
 */

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
  'i_xmetric',
  'i_e2e_xmetric',
  'i_scale',
  'i_gpus',
  'i_dates',
  'i_dstart',
  'i_dend',
  'i_optimal',
  'i_nolabel',
  'i_hc',
  'i_log',
  'i_legend',
  'i_advlabel',
  'i_gradlabel',
  'i_linelabel',
  // Evaluation
  'e_rundate',
  'e_bench',
  'e_hc',
  'e_labels',
  'e_legend',
  // Reliability
  'r_range',
  'r_pct',
  'r_hc',
  'r_legend',
] as const;

export type UrlStateKey = (typeof URL_STATE_KEYS)[number];
export type UrlStateParams = Partial<Record<UrlStateKey, string>>;

/** Default values for each parameter. Params matching their default are omitted from share URLs. */
export const PARAM_DEFAULTS: Record<UrlStateKey, string> = {
  g_model: 'DeepSeek-R1-0528',
  g_rundate: '',
  g_runid: '',
  i_seq: '8k/1k',
  i_prec: 'fp4',
  i_metric: 'y_tpPerGpu',
  i_xmetric: 'p99_ttft',
  i_e2e_xmetric: '',
  i_scale: 'auto',
  i_gpus: '',
  i_dates: '',
  i_dstart: '',
  i_dend: '',
  i_optimal: '',
  i_nolabel: '',
  i_hc: '',
  i_log: '',
  i_legend: '',
  i_advlabel: '',
  i_gradlabel: '',
  i_linelabel: '',
  e_rundate: '',
  e_bench: '',
  e_hc: '',
  e_labels: '',
  e_legend: '',
  r_range: 'last-3-months',
  r_pct: '',
  r_hc: '',
  r_legend: '',
};

/** Which param prefixes are relevant per tab. */
const TAB_PARAM_PREFIXES: Record<string, string[]> = {
  inference: ['g_', 'i_'],
  evaluation: ['g_', 'e_'],
  reliability: ['r_'],
};

/** In-memory store of current param values (kept in sync via writeUrlParams). */
let currentState: Record<string, string> = {};

// On module load: snapshot share-link params from the URL.
// Cleanup is deferred so it runs after Next.js hydration finishes.
const _initialParams: UrlStateParams = {};
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  for (const key of URL_STATE_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) {
      _initialParams[key] = value;
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
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, 0);
}

/** Returns the share-link params that were in the URL at page load. */
export function readUrlParams(): UrlStateParams {
  return _initialParams;
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
    } else {
      currentState[urlKey] = value;
    }
  }

  pendingParams = {};
  writeTimer = null;
}

/**
 * Build a share URL containing only the params relevant to the current tab.
 * Flushes pending writes first so state is up-to-date.
 */
export function buildShareUrl(): string {
  flushPendingParams();

  const pathTab = window.location.pathname.split('/').filter(Boolean)[0] || 'inference';
  const prefixes = TAB_PARAM_PREFIXES[pathTab] ?? TAB_PARAM_PREFIXES.inference;

  const filtered = new URLSearchParams();
  for (const [key, value] of Object.entries(currentState)) {
    if (prefixes.some((p) => key.startsWith(p))) {
      filtered.set(key, value);
    }
  }

  const search = filtered.toString();
  return `${window.location.origin}/${pathTab}${search ? `?${search}` : ''}`;
}
