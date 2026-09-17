/**
 * Pure time-series helpers for the PowerX telemetry charts. They operate on
 * absolute millisecond timestamps so irregular sampling (dropped rows, a few
 * ms of skew between chips) is handled by time, not by sample index.
 */

export interface TimedSample {
  /** Absolute timestamp in milliseconds since the Unix epoch. */
  ms: number;
  value: number;
}

/** Rolling-average window choices offered by the chart controls, in seconds. */
export const SMOOTHING_WINDOWS_S = [10, 30, 60, 300] as const;
export type SmoothingWindowS = (typeof SMOOTHING_WINDOWS_S)[number];

export interface AggregatedSample extends TimedSample {
  /** Number of chips that contributed a sample within tolerance. */
  count: number;
}

export type TelemetryDisplayMode = 'points' | 'rolling';
/** Per-chip lines, one mean line across the visible chips, or both. */
export type TelemetrySeriesMode = 'chips' | 'mean' | 'both';

export interface TelemetryDisplayState {
  mode: TelemetryDisplayMode;
  windowS: SmoothingWindowS;
  series: TelemetrySeriesMode;
}

/** Rolling average is the default: at 1 s cadence the raw points read as noise. */
export const DEFAULT_TELEMETRY_DISPLAY: TelemetryDisplayState = {
  mode: 'rolling',
  windowS: 30,
  series: 'chips',
};

/**
 * Centered time-window mean. Each output sample averages every input sample
 * whose timestamp lies within `windowMs / 2` (inclusive) of its own, so the
 * smoothed line stays time-aligned with the raw one instead of lagging by half
 * a window as a trailing average would. Window edges are inclusive on both
 * sides; samples near the start or end of the series average over the shorter
 * one-sided neighbourhood that exists.
 *
 * `samples` must be sorted by `ms` ascending. O(n) via prefix sums.
 */
export function rollingTimeAverage(
  samples: readonly TimedSample[],
  windowMs: number,
): TimedSample[] {
  if (samples.length === 0) return [];
  if (!(windowMs > 0)) return samples.map(({ ms, value }) => ({ ms, value }));
  const half = windowMs / 2;
  const n = samples.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) prefix[i + 1] = prefix[i]! + samples[i]!.value;

  const out: TimedSample[] = Array.from({ length: n });
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i += 1) {
    const center = samples[i]!.ms;
    while (samples[lo]!.ms < center - half) lo += 1;
    while (hi < n && samples[hi]!.ms <= center + half) hi += 1;
    const count = hi - lo;
    out[i] = { ms: center, value: (prefix[hi]! - prefix[lo]!) / count };
  }
  return out;
}

/**
 * Median gap between consecutive samples, in ms. Used as the alignment
 * tolerance when averaging chips that were polled a few ms apart. Falls back
 * to `fallbackMs` when fewer than two distinct timestamps exist.
 */
export function estimateSampleIntervalMs(
  samples: readonly TimedSample[],
  fallbackMs = 1000,
): number {
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i += 1) {
    const gap = samples[i]!.ms - samples[i - 1]!.ms;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return fallbackMs;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

/**
 * Mean across several chips at each timestamp of the reference chip (the one
 * with the most samples, first on ties). For every reference sample each other
 * chip contributes its nearest sample if that sample lies within
 * `toleranceMs`; chips with no sample that close are left out of that mean
 * rather than interpolated, and `count` records how many contributed.
 *
 * Every inner array must be sorted by `ms` ascending.
 */
export function meanAcrossSeries(
  series: readonly (readonly TimedSample[])[],
  toleranceMs: number,
): AggregatedSample[] {
  const populated = series.filter((s) => s.length > 0);
  if (populated.length === 0) return [];
  let reference = populated[0]!;
  for (const s of populated) if (s.length > reference.length) reference = s;
  const others = populated.filter((s) => s !== reference);
  const cursors: number[] = Array.from({ length: others.length }, () => 0);
  const tolerance = Math.max(0, toleranceMs);

  return reference.map((ref) => {
    let sum = ref.value;
    let count = 1;
    for (let k = 0; k < others.length; k += 1) {
      const other = others[k]!;
      let cursor = cursors[k]!;
      while (
        cursor + 1 < other.length &&
        Math.abs(other[cursor + 1]!.ms - ref.ms) <= Math.abs(other[cursor]!.ms - ref.ms)
      ) {
        cursor += 1;
      }
      cursors[k] = cursor;
      const candidate = other[cursor]!;
      if (Math.abs(candidate.ms - ref.ms) <= tolerance) {
        sum += candidate.value;
        count += 1;
      }
    }
    return { ms: ref.ms, value: sum / count, count };
  });
}

/**
 * Convert a relative-seconds series (`t` from its own start) to absolute
 * milliseconds so it can share an x-axis with wall-clock telemetry.
 */
export function toAbsoluteMs(
  points: readonly { t: number; value: number }[],
  originMs: number,
): TimedSample[] {
  return points.map((p) => ({ ms: originMs + p.t * 1000, value: p.value }));
}

/** Sample nearest to `ms` (earlier one on a tie), or null when the series is empty. */
export function nearestSample(samples: readonly TimedSample[], ms: number): TimedSample | null {
  if (samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.ms < ms) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo]!;
  const before = lo > 0 ? samples[lo - 1]! : after;
  return Math.abs(before.ms - ms) <= Math.abs(after.ms - ms) ? before : after;
}
