import type { InferenceData } from '@/components/inference/types';

import {
  paretoFrontLowerLeft,
  paretoFrontLowerRight,
  paretoFrontUpperLeft,
  paretoFrontUpperRight,
} from './chart-utils';

export type RooflineDirection = 'upper_left' | 'upper_right' | 'lower_left' | 'lower_right';

export interface ParetoPoint {
  x: number;
  y: number;
}

export interface UpliftSample {
  x: number;
  yBaseline: number;
  yCandidate: number;
  ratio: number;
}

export interface UpliftResult {
  /**
   * Geometric mean of per-SLA ratios, direction-normalized so >1 always means "candidate
   * better" and <1 always means "baseline better", regardless of whether y is higher-is-better
   * (throughput) or lower-is-better (cost, energy).
   */
  geomean: number;
  samples: UpliftSample[];
  /** x-range where both Pareto fronts overlap and SLAs are sampled. */
  overlapRange: { min: number; max: number } | null;
  /** overlap / union of the two x-ranges. 0 = disjoint, 1 = identical bounds. */
  coverage: number;
  baselineFrontSize: number;
  candidateFrontSize: number;
}

const FRONT_FNS: Record<RooflineDirection, (pts: InferenceData[]) => InferenceData[]> = {
  upper_left: paretoFrontUpperLeft,
  upper_right: paretoFrontUpperRight,
  lower_left: paretoFrontLowerLeft,
  lower_right: paretoFrontLowerRight,
};

export function yHigherIsBetter(dir: RooflineDirection): boolean {
  return dir === 'upper_left' || dir === 'upper_right';
}

/** Linear interpolation of y at x along a curve sorted ascending by x. Returns null out of range. */
export function interpolateY(curve: ParetoPoint[], x: number): number | null {
  if (curve.length === 0) return null;
  if (curve.length === 1) return curve[0].x === x ? curve[0].y : null;
  const first = curve[0];
  const last = curve.at(-1)!;
  if (x < first.x || x > last.x) return null;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (x >= a.x && x <= b.x) {
      if (b.x === a.x) return (a.y + b.y) / 2;
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return null;
}

/**
 * Sample n points across [min, max]. Uses log-spacing when the range spans >10×
 * (so SLAs distribute evenly across orders of magnitude).
 */
export function sampleSLAs(min: number, max: number, n: number): number[] {
  if (!(min > 0) || !(max > 0) || min >= max || n < 1) return [];
  if (n === 1) return [Math.sqrt(min * max)];
  const useLog = Math.log10(max / min) > 1;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(useLog ? min * (max / min) ** t : min + t * (max - min));
  }
  return pts;
}

/** Compute Pareto front from raw points and return sorted ascending by x. */
function computeFront(points: InferenceData[], direction: RooflineDirection): ParetoPoint[] {
  if (points.length === 0) return [];
  // paretoFront* mutates via .sort; clone to avoid side effects on the caller's array.
  const front = FRONT_FNS[direction]([...points]);
  return front
    .map((p) => ({ x: p.x, y: p.y }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .toSorted((a, b) => a.x - b.x);
}

/**
 * Compare two Pareto curves and return a single-number geomean uplift ratio.
 *
 * Algorithm: compute Pareto fronts for each set, find x-overlap, sample N SLAs across the
 * overlap, linearly interpolate y on each front, and take the geometric mean of per-SLA
 * (candidate/baseline) ratios. Ratio is inverted for lower-is-better metrics so the result
 * always reads "candidate performance relative to baseline" (>1 = better, <1 = worse).
 */
export function computeUplift(
  baselinePts: InferenceData[],
  candidatePts: InferenceData[],
  direction: RooflineDirection,
  slaCount = 5,
): UpliftResult {
  const baseline = computeFront(baselinePts, direction);
  const candidate = computeFront(candidatePts, direction);

  const empty: UpliftResult = {
    geomean: NaN,
    samples: [],
    overlapRange: null,
    coverage: 0,
    baselineFrontSize: baseline.length,
    candidateFrontSize: candidate.length,
  };

  if (baseline.length === 0 || candidate.length === 0) return empty;

  const bMin = baseline[0].x;
  const bMax = baseline.at(-1)!.x;
  const cMin = candidate[0].x;
  const cMax = candidate.at(-1)!.x;

  const overlapMin = Math.max(bMin, cMin);
  const overlapMax = Math.min(bMax, cMax);
  const unionMin = Math.min(bMin, cMin);
  const unionMax = Math.max(bMax, cMax);
  const coverage =
    unionMax > unionMin ? Math.max(0, (overlapMax - overlapMin) / (unionMax - unionMin)) : 0;

  if (overlapMin >= overlapMax) {
    return { ...empty, coverage };
  }

  const slas = sampleSLAs(overlapMin, overlapMax, slaCount);
  const higherIsBetter = yHigherIsBetter(direction);

  const samples: UpliftSample[] = [];
  let logSum = 0;
  for (const x of slas) {
    const yB = interpolateY(baseline, x);
    const yC = interpolateY(candidate, x);
    if (yB === null || yC === null || yB <= 0 || yC <= 0) continue;
    const ratio = higherIsBetter ? yC / yB : yB / yC;
    samples.push({ x, yBaseline: yB, yCandidate: yC, ratio });
    logSum += Math.log(ratio);
  }

  if (samples.length === 0) {
    return {
      ...empty,
      overlapRange: { min: overlapMin, max: overlapMax },
      coverage,
    };
  }

  return {
    geomean: Math.exp(logSum / samples.length),
    samples,
    overlapRange: { min: overlapMin, max: overlapMax },
    coverage,
    baselineFrontSize: baseline.length,
    candidateFrontSize: candidate.length,
  };
}

export interface MeanUpliftResult {
  /** Direction-normalized ratio (>1 = reference is better on this metric). */
  ratio: number;
  meanBaseline: number;
  meanCandidate: number;
  countBaseline: number;
  countCandidate: number;
}

/**
 * Compare the arithmetic mean of a scalar field between two point sets. Returned ratio is
 * direction-normalized so >1 always reads "candidate (reference) outperformed baseline".
 *
 * Used for the time-stat rows in the uplift table — a simpler "how did the average move?"
 * signal that does not need a Pareto curve or SLA sampling.
 */
export function computeMeanUplift(
  baselinePts: InferenceData[],
  candidatePts: InferenceData[],
  field: keyof InferenceData,
  higherIsBetter: boolean,
): MeanUpliftResult {
  const extract = (pts: InferenceData[]): { mean: number; count: number } => {
    let sum = 0;
    let count = 0;
    for (const p of pts) {
      const v = p[field];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        sum += v;
        count++;
      }
    }
    return { count, mean: count > 0 ? sum / count : NaN };
  };
  const b = extract(baselinePts);
  const c = extract(candidatePts);
  if (!Number.isFinite(b.mean) || !Number.isFinite(c.mean) || b.mean <= 0 || c.mean <= 0) {
    return {
      ratio: NaN,
      meanBaseline: b.mean,
      meanCandidate: c.mean,
      countBaseline: b.count,
      countCandidate: c.count,
    };
  }
  const ratio = higherIsBetter ? c.mean / b.mean : b.mean / c.mean;
  return {
    ratio,
    meanBaseline: b.mean,
    meanCandidate: c.mean,
    countBaseline: b.count,
    countCandidate: c.count,
  };
}

/** Format a geomean ratio as "+17.3%", "−4.1%", or "parity". */
export function formatUpliftPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const pct = (ratio - 1) * 100;
  if (Math.abs(pct) < 0.05) return 'parity';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}
