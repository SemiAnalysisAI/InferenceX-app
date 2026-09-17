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

export type TelemetryDisplayMode = 'points' | 'rolling';

export interface TelemetryDisplayState {
  mode: TelemetryDisplayMode;
  windowS: SmoothingWindowS;
}

export const DEFAULT_TELEMETRY_DISPLAY: TelemetryDisplayState = {
  mode: 'points',
  windowS: 30,
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
