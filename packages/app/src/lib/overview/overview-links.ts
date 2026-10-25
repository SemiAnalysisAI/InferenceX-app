import { runIdFromRunUrl } from '../benchmarks/known-issues';
import {
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
  OVERVIEW_DEFAULT_MODEL_SCOPE,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  OVERVIEW_DEFAULT_ROW_SCOPE,
  OVERVIEW_PRIMARY_TIER,
  type OverviewComparisonMode,
  type OverviewConfigView,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewModelScope,
  type OverviewModelSummary,
  type OverviewReferenceHardware,
  type OverviewRowScope,
  type OverviewTier,
} from './overview-data';

export type OverviewSearchKey =
  | 'tier'
  | 'engine'
  | 'ref'
  | 'compare'
  | 'models'
  | 'rows'
  | 'hwrows'
  | 'present';

export const OVERVIEW_SEARCH_ORDER: readonly OverviewSearchKey[] = [
  'tier',
  'engine',
  'ref',
  'compare',
  'models',
  'rows',
  'hwrows',
  'present',
];

export const OVERVIEW_CLIENT_ONLY_KEYS = ['ref', 'present'] as const;

export type OverviewClientOnlySearchKey = (typeof OVERVIEW_CLIENT_ONLY_KEYS)[number];

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
  const hash = target.hash === '' ? current.hash : target.hash;
  return `${current.pathname}${search === '' ? '' : `?${search}`}${hash}`;
}
import type { UrlStateParams } from '../routing/url-state';

function overviewSequence(model: OverviewModelSummary): '8k/1k' | 'agentic-traces' {
  return model.scenario === 'agentx' ? 'agentic-traces' : '8k/1k';
}

function inferenceRoute(locale: 'en' | 'zh'): string {
  return locale === 'zh' ? '/zh/inference' : '/inference';
}

function dashboardSpecMode(specMethod: string): 'mtp' | 'stp' | undefined {
  if (specMethod === 'mixed') return undefined;
  return specMethod === 'none' || specMethod === '' ? 'stp' : 'mtp';
}

function soleSourceRun(config: OverviewConfigView): { url: string; id: string } | null {
  if (config.sourceRunUrls.length !== 1) return null;
  const url = config.sourceRunUrls[0];
  const id = runIdFromRunUrl(url);
  return id === null ? null : { url, id };
}

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

export function detailHref(locale: 'en' | 'zh', model: OverviewModelSummary): string {
  const query = new URLSearchParams({
    g_model: model.model,
    i_seq: overviewSequence(model),
    i_metric: 'y_costh',
    i_optimal: '1',
  });
  return `${inferenceRoute(locale)}?${query}`;
}

export function overviewHref(
  locale: 'en' | 'zh',
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
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
  if (rowScope !== OVERVIEW_DEFAULT_ROW_SCOPE) query.set('rows', rowScope);
  if (hardwareRowScope !== OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE) {
    query.set('hwrows', hardwareRowScope);
  }
  const search = query.toString();
  return search === '' ? base : `${base}?${search}`;
}

export function overviewTierHref(
  locale: 'en' | 'zh',
  tier: OverviewTier,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
): string {
  return overviewHref(
    locale,
    tier,
    engineScope,
    comparisonMode,
    referenceHardware,
    modelScope,
    rowScope,
    hardwareRowScope,
  );
}

export function overviewEngineScopeHref(
  locale: 'en' | 'zh',
  engineScope: OverviewEngineScope,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  modelScope: OverviewModelScope = OVERVIEW_DEFAULT_MODEL_SCOPE,
  rowScope: OverviewRowScope = OVERVIEW_DEFAULT_ROW_SCOPE,
  hardwareRowScope: OverviewHardwareRowScope = OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE,
): string {
  return overviewHref(
    locale,
    tier,
    engineScope,
    comparisonMode,
    referenceHardware,
    modelScope,
    rowScope,
    hardwareRowScope,
  );
}
