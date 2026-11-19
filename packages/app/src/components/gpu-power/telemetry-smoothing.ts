export interface TimedSample {
  ms: number;
  value: number;
}

export const SMOOTHING_WINDOWS_S = [10, 30, 60, 300] as const;
export type SmoothingWindowS = (typeof SMOOTHING_WINDOWS_S)[number];

export interface AggregatedSample extends TimedSample {
  count: number;
}

export type TelemetryDisplayMode = 'points' | 'rolling';
export type TelemetrySeriesMode = 'chips' | 'mean' | 'both';

export interface TelemetryDisplayState {
  mode: TelemetryDisplayMode;
  windowS: SmoothingWindowS;
  series: TelemetrySeriesMode;
}

export const DEFAULT_TELEMETRY_DISPLAY: TelemetryDisplayState = {
  mode: 'rolling',
  windowS: 30,
  series: 'chips',
};

export function rollingTimeAverage(
  samples: readonly TimedSample[],
  windowMs: number,
): TimedSample[] {
  if (samples.length === 0) return [];
  if (!(windowMs > 0)) return samples.map(({ ms, value }) => ({ ms, value }));
  const half = windowMs / 2;
  const n = samples.length;
  const prefix = new Float64Array(n + 1);
  const counts = new Uint32Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    const value = samples[i]!.value;
    const measured = Number.isFinite(value);
    prefix[i + 1] = prefix[i]! + (measured ? value : 0);
    counts[i + 1] = counts[i]! + (measured ? 1 : 0);
  }

  const out: TimedSample[] = Array.from({ length: n });
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i += 1) {
    const center = samples[i]!.ms;
    while (samples[lo]!.ms < center - half) lo += 1;
    while (hi < n && samples[hi]!.ms <= center + half) hi += 1;
    const count = counts[hi]! - counts[lo]!;
    out[i] = {
      ms: center,
      value: Number.isFinite(samples[i]!.value) ? (prefix[hi]! - prefix[lo]!) / count : NaN,
    };
  }
  return out;
}

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
    let sum = Number.isFinite(ref.value) ? ref.value : 0;
    let count = Number.isFinite(ref.value) ? 1 : 0;
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
      if (Number.isFinite(candidate.value) && Math.abs(candidate.ms - ref.ms) <= tolerance) {
        sum += candidate.value;
        count += 1;
      }
    }
    return { ms: ref.ms, value: count > 0 ? sum / count : NaN, count };
  });
}

export function toAbsoluteMs(
  points: readonly { t: number; value: number }[],
  originMs: number,
): TimedSample[] {
  return points.map((p) => ({ ms: originMs + p.t * 1000, value: p.value }));
}

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
