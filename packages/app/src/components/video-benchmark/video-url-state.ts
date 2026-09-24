import { H3_API_REFERENCE } from './api-reference';
import type { CostTier } from './hardware';
import {
  COST_TIERS,
  X_METRICS,
  Y_METRICS,
  type MetricOptions,
  type XMetricId,
  type YMetricId,
} from './metrics';

export interface VideoDashboardState {
  x: XMetricId;
  y: YMetricId;
  tier: CostTier;
  view: 'chart' | 'table';
  /** Only each hardware's Pareto-optimal deployments; off, dominated deployments join, faded. */
  optimal: boolean;
  /** USD per video-second the API list price assumes; the dated reference unless the reader overrides it. */
  apiPrice: number;
}

export const DEFAULT_VIDEO_DASHBOARD_STATE: VideoDashboardState = {
  x: 'p90Latency',
  y: 'videosPerDollar',
  tier: 'h',
  view: 'chart',
  optimal: true,
  apiPrice: H3_API_REFERENCE.pricePerVideoSecondUsd,
};

const VIEWS: readonly VideoDashboardState['view'][] = ['chart', 'table'];

const pick = <T extends string>(allowed: readonly T[], value: string | null, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/**
 * A USD/video-second price as typed or read from `v_api`: positive, finite,
 * kept to four decimals so the URL and the input agree. Anything else is null,
 * so callers fall back to the reference instead of pricing at 0.
 */
export function parseApiPrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw.trim() || Number.NaN);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 1e4) / 1e4;
  return rounded > 0 ? rounded : null;
}

/** Metric inputs the dashboard controls select, so no component rebuilds them by hand. */
export const metricOptions = (state: VideoDashboardState): MetricOptions => ({
  tier: state.tier,
  apiPricePerVideoSecond: parseApiPrice(state.apiPrice),
});

/** Dashboard controls live under the `v_` prefix so the run/artifact/view params stay untouched. */
export function readVideoDashboardState(search: string): VideoDashboardState {
  const p = new URLSearchParams(search);
  const d = DEFAULT_VIDEO_DASHBOARD_STATE;
  return {
    x: pick(X_METRICS, p.get('v_x'), d.x),
    y: pick(Y_METRICS, p.get('v_y'), d.y),
    tier: pick(COST_TIERS, p.get('v_tier'), d.tier),
    view: pick(VIEWS, p.get('v_view'), d.view),
    // Same shape as the inference tab's `i_optimal`: on unless the URL says `0`.
    optimal: p.get('v_optimal') !== '0',
    apiPrice: parseApiPrice(p.get('v_api')) ?? d.apiPrice,
  };
}

/** Returns a new URL with defaults omitted; the input URL is not mutated. */
export function writeVideoDashboardState(url: URL, state: VideoDashboardState): URL {
  const out = new URL(url);
  const d = DEFAULT_VIDEO_DASHBOARD_STATE;
  const set = (key: string, value: string | null) =>
    value === null ? out.searchParams.delete(key) : out.searchParams.set(key, value);
  set('v_x', state.x === d.x ? null : state.x);
  set('v_y', state.y === d.y ? null : state.y);
  set('v_tier', state.tier === d.tier ? null : state.tier);
  set('v_view', state.view === d.view ? null : state.view);
  set('v_optimal', state.optimal ? null : '0');
  const apiPrice = parseApiPrice(state.apiPrice);
  set('v_api', apiPrice === null || apiPrice === d.apiPrice ? null : String(apiPrice));
  return out;
}
