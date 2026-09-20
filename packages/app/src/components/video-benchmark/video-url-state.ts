import { H3_API_REFERENCE } from './api-reference';
import type { CostTier } from './hardware';
import {
  COST_TIERS,
  X_METRICS,
  Y_METRICS,
  type GpuBasis,
  type MetricOptions,
  type XMetricId,
  type YMetricId,
} from './metrics';

export interface VideoDashboardState {
  x: XMetricId;
  y: YMetricId;
  tier: CostTier;
  basis: GpuBasis;
  /** Also plot queued client-concurrency cells (C > replicas) as faded markers. */
  queue: boolean;
  /** Hide deployments dominated by another deployment of the same hardware. */
  optimal: boolean;
  /** Draw the cross-hardware Pareto frontier over all deployments. */
  frontier: boolean;
  view: 'chart' | 'table';
  /** USD per video-second the API-priced metrics assume; the dated reference unless the reader overrides it. */
  apiPrice: number;
}

export const DEFAULT_VIDEO_DASHBOARD_STATE: VideoDashboardState = {
  x: 'p90Latency',
  y: 'videosPerDollar',
  tier: 'h',
  basis: 'participating',
  queue: false,
  optimal: false,
  frontier: false,
  view: 'chart',
  apiPrice: H3_API_REFERENCE.pricePerVideoSecondUsd,
};

const BASES: readonly GpuBasis[] = ['participating', 'allocated'];
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

/** Metric inputs the dashboard controls select, so no component rebuilds `{ tier, basis }` by hand. */
export const metricOptions = (state: VideoDashboardState): MetricOptions => ({
  tier: state.tier,
  basis: state.basis,
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
    basis: pick(BASES, p.get('v_basis'), d.basis),
    queue: p.get('v_queue') === '1',
    optimal: p.get('v_opt') === '1',
    frontier: p.get('v_frontier') === '1',
    view: pick(VIEWS, p.get('v_view'), d.view),
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
  set('v_basis', state.basis === d.basis ? null : state.basis);
  set('v_queue', state.queue ? '1' : null);
  set('v_opt', state.optimal ? '1' : null);
  set('v_frontier', state.frontier ? '1' : null);
  set('v_view', state.view === d.view ? null : state.view);
  const apiPrice = parseApiPrice(state.apiPrice);
  set('v_api', apiPrice === null || apiPrice === d.apiPrice ? null : String(apiPrice));
  return out;
}
