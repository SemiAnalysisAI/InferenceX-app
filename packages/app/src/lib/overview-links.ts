import { runIdFromRunUrl } from './known-issues';
import {
  OVERVIEW_PRIMARY_TIER,
  type OverviewConfigResult,
  type OverviewModelSummary,
  type OverviewTier,
} from './overview-data';
import type { UrlStateParams } from './url-state';

/** The single-turn 8K-in/1K-out workload every overview link filters to. */
const OVERVIEW_WORKLOAD_SEQ = '8k/1k';

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
    i_seq: OVERVIEW_WORKLOAD_SEQ,
    i_prec: config.precision,
    i_gpus: config.hwKey,
    i_spec: dashboardSpecMode(config.specMethod),
    i_disagg: config.disagg ? 'disagg' : 'agg',
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
    i_seq: OVERVIEW_WORKLOAD_SEQ,
    i_optimal: '1',
  });
  return `${inferenceRoute(locale)}?${query}`;
}

/**
 * The overview itself at another service point. The default tier keeps the bare
 * canonical URL; other tiers ride a plain `?tier=` query the server re-renders
 * from, so any view is a copyable link.
 */
export function overviewTierHref(locale: 'en' | 'zh', tier: OverviewTier): string {
  const base = locale === 'zh' ? '/zh/overview' : '/overview';
  return tier === OVERVIEW_PRIMARY_TIER ? base : `${base}?tier=${tier}`;
}
