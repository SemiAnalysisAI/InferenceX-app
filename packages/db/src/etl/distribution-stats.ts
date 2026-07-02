/**
 * Generic distribution math shared by the dataset ETL: percentile summaries
 * and histogram binning for the dataset-detail cards. Pure functions, no DB
 * access. (The per-benchmark-row percentile bundle uses `percentilesOf` in
 * `queries/agentic-aggregates` — a different shape with its own version key.)
 */

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface NumberSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
}

/** Distribution summary with linear-interpolated percentiles. */
export function summarizeValues(values: readonly number[]): NumberSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0 };
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const quantile = (q: number): number => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted.at(-1)!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: quantile(0.5),
    p75: quantile(0.75),
    p90: quantile(0.9),
    p95: quantile(0.95),
  };
}

/** Linear-width histogram over [0, max]. Empty input → []. */
export function linearHistogram(values: readonly number[], bins = 40): HistogramBin[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  if (max <= 0) return [{ x0: 0, x1: 1, count: values.length }];
  const width = max / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    x0: i * width,
    x1: (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(v / width)));
    out[idx].count += 1;
  }
  return out;
}

/** Log-width histogram over positive values (values ≤ 0 are dropped). */
export function logHistogram(values: readonly number[], bins = 40): HistogramBin[] {
  const pos = values.filter((v) => v > 0);
  if (pos.length === 0) return [];
  const min = Math.min(...pos);
  const max = Math.max(...pos);
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  if (hi <= lo) return [{ x0: min, x1: max <= min ? min * 10 : max, count: pos.length }];
  const width = (hi - lo) / bins;
  const out: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    x0: 10 ** (lo + i * width),
    x1: 10 ** (lo + (i + 1) * width),
    count: 0,
  }));
  for (const v of pos) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((Math.log10(v) - lo) / width)));
    out[idx].count += 1;
  }
  return out;
}

/** Log-width histogram that preserves zero as a dedicated first bin. */
export function logHistogramWithZero(values: readonly number[], bins = 40): HistogramBin[] {
  const zeroCount = values.filter((value) => value === 0).length;
  const positive = values.filter((value) => value > 0);
  if (zeroCount === 0) return logHistogram(positive, bins);
  if (positive.length === 0) return [{ x0: 0, x1: 1, count: zeroCount }];
  const positiveBins = logHistogram(positive, Math.max(1, bins - 1));
  return [{ x0: 0, x1: positiveBins[0]?.x0 ?? 1, count: zeroCount }, ...positiveBins];
}
