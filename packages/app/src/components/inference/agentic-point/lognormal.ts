/**
 * Lognormal fitting and log-spaced binning for the ISL/OSL distribution charts.
 *
 * Per-request sequence lengths span orders of magnitude (a few hundred tokens
 * to tens of thousands), so a linear histogram collapses almost every request
 * into the leftmost bins and leaves a long, unreadable tail. Binning uniformly
 * in ln(x) instead spreads the mass out, and a lognormal — normal in ln(x) —
 * then reads as an ordinary bell curve that can be compared against the bars.
 *
 * Every function here takes and returns plain numbers so the chart component
 * stays presentational and this math is unit-testable on its own.
 */

/** A lognormal fitted to sample data. */
export interface LognormalFit {
  /** Mean of ln(x) — the location parameter. */
  mu: number;
  /** Standard deviation of ln(x) — the shape parameter. */
  sigma: number;
  /** exp(mu): the fitted median, in the original units. */
  median: number;
  /** Number of positive samples the fit used. */
  n: number;
}

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
 * Abramowitz & Stegun 7.1.26 — max absolute error 1.5e-7, which is far below
 * anything visible in a chart.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-z * z));
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Standard normal PDF. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Density of the fitted lognormal at `x`, in the original units. */
export function lognormalPdf(x: number, mu: number, sigma: number): number {
  if (x <= 0 || sigma <= 0) return 0;
  return normalPdf((Math.log(x) - mu) / sigma) / (x * sigma);
}

/** P(X <= x) for the fitted lognormal. */
export function lognormalCdf(x: number, mu: number, sigma: number): number {
  if (x <= 0) return 0;
  if (sigma <= 0) return Math.log(x) >= mu ? 1 : 0;
  return normalCdf((Math.log(x) - mu) / sigma);
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
 * Maximum-likelihood lognormal fit: the MLE is just the mean and (population)
 * standard deviation of ln(x), so no iteration is needed.
 *
 * Returns `null` when fewer than two positive samples are available, or when
 * every sample is identical — sigma would be zero and the curve degenerate.
 */
export function fitLognormal(values: readonly number[]): LognormalFit | null {
  const positive = positiveValues(values);
  const n = positive.length;
  if (n < 2) return null;

  const logs = positive.map((v) => Math.log(v));
  const mu = logs.reduce((sum, v) => sum + v, 0) / n;
  const variance = logs.reduce((sum, v) => sum + (v - mu) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  // Summing identical logs still leaves a residual variance around 1e-32, so
  // requiring merely `sigma > 0` would admit a spike of zero width. Compare
  // against the scale of mu instead, which is what "no spread" really means.
  if (!Number.isFinite(mu) || !(sigma > 1e-9 * Math.max(1, Math.abs(mu)))) return null;

  return { mu, sigma, median: Math.exp(mu), n };
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
  let lnMin = Math.log(Math.min(...positive));
  let lnMax = Math.log(Math.max(...positive));
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
 * The fitted curve sampled for drawing, in the same units as the bar heights.
 *
 * Because bins are uniform in ln(x), the expected count in a bin of width
 * `lnStep` is `n * lnStep * normalPdf(ln x)`, so the curve can be evaluated
 * directly in ln space and lines up with the bars without further scaling.
 */
export function lognormalCurve(
  fit: LognormalFit,
  histogram: LogHistogram,
  samples = 120,
): { value: number; count: number }[] {
  const points: { value: number; count: number }[] = [];
  const steps = Math.max(2, Math.floor(samples));
  for (let i = 0; i < steps; i++) {
    const lnValue = histogram.lnMin + ((histogram.lnMax - histogram.lnMin) * i) / (steps - 1);
    const density = normalPdf((lnValue - fit.mu) / fit.sigma) / fit.sigma;
    points.push({ value: Math.exp(lnValue), count: fit.n * histogram.lnStep * density });
  }
  return points;
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
