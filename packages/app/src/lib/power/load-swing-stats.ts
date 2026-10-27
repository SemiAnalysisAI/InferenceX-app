import {
  bucketTimeMs,
  meanPowerAt,
  type GpuPowerSeries,
} from '@/components/gpu-power/power-series';

/**
 * Load-swing statistics of one PowerX power trace (P0-3), computed from the
 * stored one-second buckets of the per-GPU mean. The same function serves the
 * Over time view and `GET /api/v1/gpu-metrics-point/stats`, so the dashboard
 * and the API cannot disagree.
 *
 * Whole-run figures: peak, min, max 1 s and 5 s change, ramp up / down.
 * Validated-window figures: mean, P5 / P95, volatility (std ÷ mean).
 * Idle floor: P5 of the samples before the serving window starts.
 * Gaps in the trace (a bucket more than 1.5× the sample interval after the
 * previous one) are counted, never interpolated over, and no delta is read
 * across one.
 */
export interface LoadSwingInput {
  /** Per-bucket values (W per GPU); null buckets are skipped. */
  samples: readonly (number | null)[];
  /** Bucket time in seconds from the first bucket, same length as `samples`. */
  times: readonly number[];
  /** Sample interval in seconds (the bucket width). */
  intervalSeconds: number;
  /** Validated serving window as bucket-time bounds (seconds), or null when not recorded. */
  windowStartSeconds: number | null;
  windowEndSeconds: number | null;
}

export interface LoadSwingStats {
  unit: 'W per GPU' | 'kW per NVL72 rack';
  sampleIntervalSeconds: number;
  sampleCount: number;
  windowSampleCount: number;
  preServingSampleCount: number;
  /** Buckets more than 1.5× the interval after the previous one. */
  gapCount: number;
  peak: number;
  min: number;
  /** P5 of the samples before the serving window; null without a recorded window or pre-window samples. */
  idleFloor: number | null;
  /** Validated window only; null without a recorded window. */
  mean: number | null;
  p5: number | null;
  p95: number | null;
  /** Largest change between consecutive buckets (whole run). */
  maxDelta1s: number;
  /** Largest change over a 5-second span (whole run). */
  maxDelta5s: number;
  /** Largest rise over a 5-second span, per second. */
  rampUpPerSecond: number;
  /** Largest fall over a 5-second span, per second (positive). */
  rampDownPerSecond: number;
  /** Standard deviation over mean inside the validated window; null without a window. */
  volatility: number | null;
}

export const NVL72_GPUS_PER_RACK = 72;
const DELTA_SPAN_SECONDS = 5;
const GAP_FACTOR = 1.5;

export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function computeLoadSwingStats(input: LoadSwingInput): LoadSwingStats | null {
  const interval = input.intervalSeconds > 0 ? input.intervalSeconds : 1;
  const points: { t: number; v: number }[] = [];
  for (const [i, v] of input.samples.entries()) {
    const t = input.times[i];
    if (v === null || v === undefined || !Number.isFinite(v) || !Number.isFinite(t)) continue;
    points.push({ t, v });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.t - b.t);
  const hasWindow =
    input.windowStartSeconds !== null &&
    input.windowEndSeconds !== null &&
    Number.isFinite(input.windowStartSeconds) &&
    Number.isFinite(input.windowEndSeconds) &&
    input.windowEndSeconds > input.windowStartSeconds;
  const all = points.map((p) => p.v);
  const window = hasWindow
    ? points.filter((p) => p.t >= input.windowStartSeconds! && p.t <= input.windowEndSeconds!)
    : [];
  const before = hasWindow ? points.filter((p) => p.t < input.windowStartSeconds!) : [];

  let gapCount = 0;
  let maxDelta1s = 0;
  for (let i = 1; i < points.length; i++) {
    const step = points[i].t - points[i - 1].t;
    if (step > interval * GAP_FACTOR) {
      gapCount += 1;
      continue;
    }
    maxDelta1s = Math.max(maxDelta1s, Math.abs(points[i].v - points[i - 1].v));
  }
  let maxDelta5s = 0;
  let rampUp = 0;
  let rampDown = 0;
  let j = 0;
  for (const start of points) {
    const target = start.t + DELTA_SPAN_SECONDS;
    while (j < points.length && points[j].t < target) j++;
    if (j >= points.length) break;
    const span = points[j].t - start.t;
    // A span that overruns the 5 s by more than one interval crosses a gap.
    if (span > DELTA_SPAN_SECONDS + interval * GAP_FACTOR) continue;
    const delta = points[j].v - start.v;
    maxDelta5s = Math.max(maxDelta5s, Math.abs(delta));
    rampUp = Math.max(rampUp, delta / span);
    rampDown = Math.max(rampDown, -delta / span);
  }
  const windowValues = window.map((p) => p.v);
  const mean =
    windowValues.length > 0 ? windowValues.reduce((s, v) => s + v, 0) / windowValues.length : null;
  const volatility =
    mean !== null && mean > 0
      ? Math.sqrt(windowValues.reduce((s, v) => s + (v - mean) ** 2, 0) / windowValues.length) /
        mean
      : null;
  return {
    unit: 'W per GPU',
    sampleIntervalSeconds: interval,
    sampleCount: points.length,
    windowSampleCount: window.length,
    preServingSampleCount: before.length,
    gapCount,
    peak: Math.max(...all),
    min: Math.min(...all),
    idleFloor: quantile(
      before.map((p) => p.v),
      0.05,
    ),
    mean,
    p5: quantile(windowValues, 0.05),
    p95: quantile(windowValues, 0.95),
    maxDelta1s,
    maxDelta5s,
    rampUpPerSecond: rampUp,
    rampDownPerSecond: rampDown,
    volatility,
  };
}

const SCALED_KEYS = [
  'peak',
  'min',
  'idleFloor',
  'mean',
  'p5',
  'p95',
  'maxDelta1s',
  'maxDelta5s',
  'rampUpPerSecond',
  'rampDownPerSecond',
] as const;

/**
 * The per-GPU statistics × 72 in kW per NVL72 rack. An upper bound: it assumes
 * every GPU of the rack swings together. Volatility is a ratio and is unchanged.
 */
export function scaleLoadSwingStatsToRack(stats: LoadSwingStats): LoadSwingStats {
  const factor = NVL72_GPUS_PER_RACK / 1000;
  const scaled: Record<string, unknown> = { ...stats, unit: 'kW per NVL72 rack' };
  for (const key of SCALED_KEYS) {
    const value = stats[key];
    scaled[key] = value === null ? null : value * factor;
  }
  return scaled as unknown as LoadSwingStats;
}

/** The per-GPU mean trace of a bucketed series as a `LoadSwingInput`. */
export function loadSwingInputFromSeries(
  series: GpuPowerSeries,
  windowStartMs: number | null,
  windowEndMs: number | null,
): LoadSwingInput {
  const toSeconds = (ms: number | null) =>
    ms === null || !Number.isFinite(ms) ? null : (ms - series.startMs) / 1000;
  return {
    samples: series.t.map((_, column) => meanPowerAt(series, column)),
    times: series.t.map((_, column) => (bucketTimeMs(series, column) - series.startMs) / 1000),
    intervalSeconds: series.bucketSeconds,
    windowStartSeconds: toSeconds(windowStartMs),
    windowEndSeconds: toSeconds(windowEndMs),
  };
}

export function loadSwingStatsFromSeries(
  series: GpuPowerSeries,
  windowStartMs: number | null,
  windowEndMs: number | null,
): LoadSwingStats | null {
  return computeLoadSwingStats(loadSwingInputFromSeries(series, windowStartMs, windowEndMs));
}

/** One CSV row per bucket: time, serving-relative time, window flag and the per-GPU mean (or per rack). */
export function loadSwingTraceRows(
  series: GpuPowerSeries,
  windowStartMs: number | null,
  windowEndMs: number | null,
  scale: 'gpu' | 'nvl72' = 'gpu',
): Record<string, number | string>[] {
  const input = loadSwingInputFromSeries(series, windowStartMs, windowEndMs);
  const factor = scale === 'nvl72' ? NVL72_GPUS_PER_RACK / 1000 : 1;
  const column = scale === 'nvl72' ? 'kw_per_nvl72_rack' : 'w_per_gpu';
  const hasWindow = input.windowStartSeconds !== null && input.windowEndSeconds !== null;
  return input.times.map((t, index) => {
    const value = input.samples[index];
    return {
      t_s: t,
      since_serving_s: hasWindow ? t - input.windowStartSeconds! : '',
      in_validated_window:
        hasWindow && t >= input.windowStartSeconds! && t <= input.windowEndSeconds! ? 1 : 0,
      [column]: value === null ? '' : Number((value * factor).toFixed(scale === 'nvl72' ? 3 : 1)),
    };
  });
}
