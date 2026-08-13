import { runIdFromRunUrl } from './known-issues';
import {
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_DEFAULT_MODEL_SCOPE,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  OVERVIEW_PRIMARY_TIER,
  type OverviewComparisonMode,
  type OverviewConfigView,
  type OverviewEngineScope,
  type OverviewModelScope,
  type OverviewModelSummary,
  type OverviewReferenceHardware,
  type OverviewTier,
} from './overview-data';

export type OverviewSearchKey = 'tier' | 'engine' | 'ref' | 'compare' | 'models';

export const OVERVIEW_SEARCH_ORDER: readonly OverviewSearchKey[] = [
  'tier',
  'engine',
  'ref',
  'compare',
  'models',
];

/** Params the client resolves without asking the server. `ref` only picks which
 *  column the percentages are measured against, and every cost that needs is
 *  already in the payload — so it must not vary the data cache key. */
export const OVERVIEW_CLIENT_ONLY_KEYS: readonly OverviewSearchKey[] = ['ref'];

/** Apply one control's destination to the latest pending overview URL.
 * This prevents a second, fast selection from rebuilding from stale server
 * props while the first App Router transition is still in flight. */
export function mergeOverviewControlHref(
  currentHref: string,
  targetHref: string,
  keys: readonly OverviewSearchKey[],
): string {
  const origin = 'https://inferencex.local';
  const current = new URL(currentHref, origin);
  const target = new URL(targetHref, origin);

  current.pathname = target.pathname;
  for (const key of keys) {
    const value = target.searchParams.get(key);
    if (value === null) current.searchParams.delete(key);
    else current.searchParams.set(key, value);
  }

  const ordered = new URLSearchParams();
  for (const key of OVERVIEW_SEARCH_ORDER) {
    const value = current.searchParams.get(key);
    if (value !== null) ordered.set(key, value);
  }
  for (const [key, value] of current.searchParams) {
    if (!OVERVIEW_SEARCH_ORDER.includes(key as OverviewSearchKey)) ordered.append(key, value);
  }

  const search = ordered.toString();
  // A control href never carries a fragment, so an absent one means "keep the
  // one already on the page" rather than "clear it".
  const hash = target.hash === '' ? current.hash : target.hash;
  return `${current.pathname}${search === '' ? '' : `?${search}`}${hash}`;
}
import type { UrlStateParams } from './url-state';

function overviewSequence(model: OverviewModelSummary): '8k/1k' | 'agentic-traces' {
  return model.scenario === 'agentx' ? 'agentic-traces' : '8k/1k';
}

/** The `/inference` route base for a locale — shared by every overview link. */
function inferenceRoute(locale: 'en' | 'zh'): string {
  return locale === 'zh' ? '/zh/inference' : '/inference';
}

/**
 * Maps a raw DB `spec_method` to the dashboard's `SpecMode` filter bucket
 * (mirrors `pointSpecMode` in quickFilters.ts, minus its hwKey suffix check —
 * overview `specMethod` comes straight from `spec_method`).
 */
function dashboardSpecMode(specMethod: string): 'mtp' | 'stp' | undefined {
  if (specMethod === 'mixed') return undefined;
  return specMethod === 'none' || specMethod === '' ? 'stp' : 'mtp';
}

/**
 * The one run backing a configuration, or null when it has none, has several,
 * or its single source URL names no run (a run list rather than a run). Both
 * helpers below read this one predicate, so the `g_runid` pin and the source-run
 * link can never disagree about whether a single run backs the configuration.
 */
function soleSourceRun(config: OverviewConfigView): { url: string; id: string } | null {
  if (config.sourceRunUrls.length !== 1) return null;
  const url = config.sourceRunUrls[0];
  const id = runIdFromRunUrl(url);
  return id === null ? null : { url, id };
}

/**
 * Inference-dashboard link narrowed to the configuration the overview ranked:
 * its model, run date, workload, precision, hardware/framework/spec key and
 * deployment mode. The run is pinned only when a single run produced the
 * configuration — pinning one of several would hide the rest of its frontier.
 *
 * This is a filtered view, not a proof of topology: `i_gpus` selects a
 * hardware/framework/spec key, which can still hold more than one parallelism
 * or GPU-count topology.
 */
export function buildOverviewDashboardHref(
  locale: 'en' | 'zh',
  model: OverviewModelSummary,
  config: OverviewConfigView,
): string {
  const params: UrlStateParams = {
    g_model: model.model,
    g_rundate: config.latestDate,
    g_runid: soleSourceRun(config)?.id,
    i_seq: overviewSequence(model),
    i_prec: config.precision,
    i_metric: 'y_costh',
    i_gpus: config.hwKey,
    i_spec: dashboardSpecMode(config.specMethod),
    i_disagg: config.disagg ? 'disagg' : config.isMultinode ? 'multi-node' : 'single-node',
    i_optimal: '1',
    i_advlabel: '1',
  };

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  return `${inferenceRoute(locale)}?${query}`;
}

function uniqueValues(values: readonly string[]): string {
  return [...new Set(values)].join(',');
}

/**
 * Dashboard view for one Overview 30-day cell. The two independently ranked
 * serving envelopes are carried explicitly so the chart can show exactly the
 * curves behind the percentage even when engine, precision, or topology changed.
 */
export function buildOverviewHistoryDashboardHref(
  locale: 'en' | 'zh',
  model: OverviewModelSummary,
  current: OverviewConfigView,
  baseline: OverviewConfigView,
): string {
  const currentRun = soleSourceRun(current);
  const baselineRun = soleSourceRun(baseline);
  const params: UrlStateParams = {
    g_model: model.model,
    g_rundate: current.latestDate,
    g_runid: currentRun?.id,
    i_seq: overviewSequence(model),
    i_prec: uniqueValues([current.precision, baseline.precision]),
    i_metric: 'y_costh',
    i_xmode: 'interactivity',
    i_gpus: uniqueValues([current.hwKey, baseline.hwKey]),
    i_dates: uniqueValues([
      current.latestDate,
      baselineRun === null ? baseline.latestDate : `${baseline.latestDate}~r${baselineRun.id}`,
    ]),
    i_overview_current: current.key,
    i_overview_baseline: baseline.key,
    i_optimal: '1',
    i_advlabel: '1',
  };

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  return `${inferenceRoute(locale)}?${query}`;
}

/**
 * Model-level dashboard view: precision-neutral, because the two headline pairs
 * may select different precisions. Result-level evidence links narrow further.
 */
export function detailHref(locale: 'en' | 'zh', model: OverviewModelSummary): string {
  const query = new URLSearchParams({
    g_model: model.model,
    i_seq: overviewSequence(model),
    i_metric: 'y_costh',
    i_optimal: '1',
  });
  return `${inferenceRoute(locale)}?${query}`;
}

/** Canonical overview URL. Defaults are omitted and params always use this order. */
export function overviewHref(
  locale: 'en' | 'zh',
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
): string {
  const base = locale === 'zh' ? '/zh/overview' : '/overview';
  const query = new URLSearchParams();
  if (tier !== OVERVIEW_PRIMARY_TIER) query.set('tier', String(tier));
  if (engineScope !== 'community') query.set('engine', engineScope);
  if (referenceHardware !== OVERVIEW_DEFAULT_REFERENCE_HARDWARE) {
    query.set('ref', referenceHardware);
  }
  if (comparisonMode !== 'hardware') query.set('compare', comparisonMode);
  if (modelScope !== OVERVIEW_DEFAULT_MODEL_SCOPE) query.set('models', modelScope);
  const search = query.toString();
  return search === '' ? base : `${base}?${search}`;
}

/** Tier switch preserving the active engine scope. */
export function overviewTierHref(
  locale: 'en' | 'zh',
  tier: OverviewTier,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
): string {
  return overviewHref(locale, tier, engineScope, comparisonMode, referenceHardware, modelScope);
}

/** Engine-scope switch preserving the active service tier. */
export function overviewEngineScopeHref(
  locale: 'en' | 'zh',
  engineScope: OverviewEngineScope,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
): string {
  return overviewHref(locale, tier, engineScope, comparisonMode, referenceHardware, modelScope);
}
