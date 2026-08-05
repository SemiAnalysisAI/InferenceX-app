import { runIdFromRunUrl } from './known-issues';
import {
  OVERVIEW_DEFAULT_COMPARISON_MODE,
  OVERVIEW_PRIMARY_TIER,
  type OverviewComparisonMode,
  type OverviewConfigResult,
  type OverviewEngineScope,
  type OverviewModelSummary,
  type OverviewTier,
} from './overview-data';
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
function dashboardSpecMode(specMethod: string): 'mtp' | 'stp' {
  return specMethod === 'none' || specMethod === '' ? 'stp' : 'mtp';
}

/**
 * The one run backing a configuration, or null when it has none, has several,
 * or its single source URL names no run (a run list rather than a run). Both
 * helpers below read this one predicate, so the `g_runid` pin and the source-run
 * link can never disagree about whether a single run backs the configuration.
 */
function soleSourceRun(config: OverviewConfigResult): { url: string; id: string } | null {
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
  config: OverviewConfigResult,
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
): string {
  const base = locale === 'zh' ? '/zh/overview' : '/overview';
  const query = new URLSearchParams();
  if (tier !== OVERVIEW_PRIMARY_TIER) query.set('tier', String(tier));
  if (engineScope !== 'community') query.set('engine', engineScope);
  if (comparisonMode === 'history') query.set('compare', '30d');
  const search = query.toString();
  return search === '' ? base : `${base}?${search}`;
}

/** Tier switch preserving the active engine scope. */
export function overviewTierHref(
  locale: 'en' | 'zh',
  tier: OverviewTier,
  engineScope: OverviewEngineScope = 'community',
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
): string {
  return overviewHref(locale, tier, engineScope, comparisonMode);
}

/** Engine-scope switch preserving the active service tier. */
export function overviewEngineScopeHref(
  locale: 'en' | 'zh',
  engineScope: OverviewEngineScope,
  tier: OverviewTier = OVERVIEW_PRIMARY_TIER,
  comparisonMode: OverviewComparisonMode = OVERVIEW_DEFAULT_COMPARISON_MODE,
): string {
  return overviewHref(locale, tier, engineScope, comparisonMode);
}
