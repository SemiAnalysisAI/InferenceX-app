import { H3_API_REFERENCE } from './api-reference';
import { VIDEO_MODELS, type VideoModel } from './models';
import { VIDEO_HARDWARE_ROSTER, type CostTier } from './hardware';
import { QUALITY_METRICS, QUALITY_SCALE, type QualityMetricId } from './quality';
import {
  COST_TIERS,
  X_METRICS,
  Y_METRICS,
  type MetricOptions,
  type XMetricId,
  type YMetricId,
} from './metrics';

export interface VideoDashboardState {
  model: VideoModel;
  x: XMetricId;
  y: YMetricId;
  tier: CostTier;
  view: 'chart' | 'table';
  /** Only each hardware's Pareto-optimal deployments; off, dominated deployments join, faded. */
  optimal: boolean;
  /** USD per video-second the API list price assumes; the dated reference unless the reader overrides it. */
  apiPrice: number | null;
  /** Hardware hidden from the chart, table and CSV. */
  hidden: string[];
  /** Separate rubric dimension; never an average of unrelated scores. */
  qualityMetric: QualityMetricId;
  /** Reader-selected filter, independent of the evaluator's frozen calibration rule. */
  qualityThreshold: number | null;
}

export const DEFAULT_VIDEO_DASHBOARD_STATE: VideoDashboardState = {
  model: 'h3',
  x: 'p90Latency',
  y: 'videosPerDollar',
  tier: 'h',
  view: 'chart',
  optimal: true,
  apiPrice: H3_API_REFERENCE.pricePerVideoSecondUsd,
  hidden: [],
  qualityMetric: 'prompt_adherence',
  qualityThreshold: null,
};

const VIEWS: readonly VideoDashboardState['view'][] = ['chart', 'table'];

const hiddenHardware = (keys: readonly string[]) =>
  VIDEO_HARDWARE_ROSTER.filter(({ key }) => keys.includes(key)).map(({ key }) => key);

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
  qualityMetric: state.qualityMetric,
});

export function parseQualityThreshold(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= QUALITY_SCALE.minimum && value <= QUALITY_SCALE.maximum
    ? value
    : null;
}

/** Dashboard controls live under the `v_` prefix so the run/artifact/view params stay untouched. */
export function readVideoDashboardState(search: string): VideoDashboardState {
  const p = new URLSearchParams(search);
  const d = DEFAULT_VIDEO_DASHBOARD_STATE;
  const model = pick(Object.keys(VIDEO_MODELS) as VideoModel[], p.get('v_model'), d.model);
  return {
    model,
    x: pick(X_METRICS, p.get('v_x'), d.x),
    y: pick(
      model === 'h3' ? Y_METRICS : Y_METRICS.filter((id) => id !== 'quality'),
      p.get('v_y'),
      d.y,
    ),
    tier: pick(COST_TIERS, p.get('v_tier'), d.tier),
    view: pick(VIEWS, p.get('v_view'), d.view),
    // Same shape as the inference tab's `i_optimal`: on unless the URL says `0`.
    optimal: p.get('v_optimal') !== '0',
    apiPrice:
      parseApiPrice(p.get('v_api')) ??
      VIDEO_MODELS[model].apiReference?.pricePerVideoSecondUsd ??
      null,
    hidden: hiddenHardware(p.get('v_hidden')?.split(',') ?? []),
    qualityMetric: pick(
      Object.keys(QUALITY_METRICS) as QualityMetricId[],
      p.get('v_quality'),
      d.qualityMetric,
    ),
    qualityThreshold: model === 'h3' ? parseQualityThreshold(p.get('v_qmin')) : null,
  };
}

/** Returns a new URL with defaults omitted; the input URL is not mutated. */
export function writeVideoDashboardState(url: URL, state: VideoDashboardState): URL {
  const out = new URL(url);
  const d = DEFAULT_VIDEO_DASHBOARD_STATE;
  const set = (key: string, value: string | null) =>
    value === null ? out.searchParams.delete(key) : out.searchParams.set(key, value);
  set('v_model', state.model === d.model ? null : state.model);
  set('v_x', state.x === d.x ? null : state.x);
  set('v_y', state.y === d.y ? null : state.y);
  set('v_tier', state.tier === d.tier ? null : state.tier);
  set('v_view', state.view === d.view ? null : state.view);
  set('v_optimal', state.optimal ? null : '0');
  const apiPrice = parseApiPrice(state.apiPrice);
  set(
    'v_api',
    apiPrice === null || apiPrice === VIDEO_MODELS[state.model].apiReference?.pricePerVideoSecondUsd
      ? null
      : String(apiPrice),
  );
  set('v_hidden', hiddenHardware(state.hidden).join(',') || null);
  set('v_quality', state.qualityMetric === d.qualityMetric ? null : state.qualityMetric);
  set('v_qmin', state.qualityThreshold === null ? null : String(state.qualityThreshold));
  return out;
}
