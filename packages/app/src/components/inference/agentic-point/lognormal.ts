/**
 * Log-spaced binning for the ISL/OSL distribution charts.
 *
 * Per-request sequence lengths span orders of magnitude (a few hundred tokens
 * to tens of thousands), so a linear histogram collapses almost every request
 * into the leftmost bins and leaves a long, unreadable tail. Binning uniformly
 * in ln(x) instead spreads the mass out, and the roughly lognormal shape then
 * reads as an ordinary bell.
 *
 * Every function here takes and returns plain numbers so the chart component
 * stays presentational and this math is unit-testable on its own.
 */

/** Uniform-in-ln bins over a positive range. */
export interface LogHistogram {
  /** `bins + 1` bin edges in the original units, ascending. */
  edges: number[];
  /** Count per bin; `edges.length - 1` entries. */
  counts: number[];
  /** Bin width in ln space — constant, and what the fitted curve scales by. */
  lnStep: number;
  /** ln of the first and last edge. */
  lnMin: number;
  lnMax: number;
}

/**
 * Only strictly positive samples can be logged. A request that produced zero
 * tokens is real data, so callers report how many were set aside rather than
 * silently folding them into the first bin.
 */
export function positiveValues(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v) && v > 0);
}

/**
 * Histogram with bins of equal width in ln(x). `bins` is clamped to at least 1.
 * When every sample is the same value the range is widened by a factor of two
 * either side so the single spike still has somewhere to sit.
 */
export function logHistogram(values: readonly number[], bins: number): LogHistogram | null {
  const positive = positiveValues(values);
  if (positive.length === 0) return null;

  const nBins = Math.max(1, Math.floor(bins));
  // Do not spread this array into Math.min/Math.max. Large agentic runs have
  // hundreds of thousands of requests, which exceeds JavaScript engines'
  // variadic argument limit and crashes the entire point page.
  let min = positive[0]!;
  let max = min;
  for (let i = 1; i < positive.length; i++) {
    const value = positive[i]!;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  let lnMin = Math.log(min);
  let lnMax = Math.log(max);
  if (!(lnMax > lnMin)) {
    lnMin -= Math.LN2;
    lnMax += Math.LN2;
  }

  const lnStep = (lnMax - lnMin) / nBins;
  const counts: number[] = Array.from({ length: nBins }, () => 0);
  for (const value of positive) {
    const index = Math.min(nBins - 1, Math.floor((Math.log(value) - lnMin) / lnStep));
    counts[index]!++;
  }

  const edges = Array.from({ length: nBins + 1 }, (_, i) => Math.exp(lnMin + i * lnStep));
  return { edges, counts, lnStep, lnMin, lnMax };
}

/**
 * Tick values for a log axis: every power of ten in range, plus its 2x and 5x
 * steps when the range is narrow enough that decades alone would leave the axis
 * nearly bare. Always includes the endpoints so the axis is anchored.
 */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const decades = Math.log10(max) - Math.log10(min);
  const multipliers = decades > 3 ? [1] : decades > 1.5 ? [1, 5] : [1, 2, 5];
  const candidates: number[] = [min];
  for (let exp = Math.floor(Math.log10(min)); exp <= Math.ceil(Math.log10(max)); exp++) {
    for (const multiplier of multipliers) {
      const tick = multiplier * 10 ** exp;
      if (tick > min && tick < max) candidates.push(tick);
    }
  }
  candidates.push(max);

  // A data endpoint can land just short of a decade (min 95, first decade 100),
  // which would print two labels on top of each other. Keep a tick only once it
  // clears a fraction of the axis, and let the max endpoint evict its neighbour
  // rather than be dropped itself — the axis has to end at the data.
  const minGap = decades * 0.06;
  const kept: number[] = [];
  for (const tick of candidates) {
    const previous = kept.at(-1);
    if (previous === undefined || Math.log10(tick) - Math.log10(previous) >= minGap) {
      kept.push(tick);
    }
  }
  if (kept.at(-1) !== max) {
    if (kept.length > 1) kept.pop();
    kept.push(max);
  }
  return kept;
}
