import type { InferenceData } from '../types';
import { getGpuSpecs } from '@/lib/constants';
import { isPositive, powerBasisNormalization } from '@/lib/power-basis';
import {
  equalServiceSourceKey,
  getEqualServiceSources,
  observedPoints,
  type EqualServiceSource,
} from './equal-service-comparison';

/**
 * Serving-regime power model per source (PowerX Figure 15): an ordinary
 * least-squares line `W/GPU = P0 + m × output tok/s per GPU` through one
 * source's measured load points. `P0` is the fit's zero-throughput intercept,
 * not measured idle power; `m` is marginal GPU energy per output token in
 * joules. The fit describes only the observed throughput range.
 */

/** Distinct throughputs a line needs before its intercept and R² mean anything. */
export const MIN_FIT_POINTS = 3;

export interface LinearFit {
  /** `P0`, W/GPU at zero output rate (extrapolated). */
  intercept: number;
  /** `m`, J per output token (W per output tok/s/GPU). */
  slope: number;
  /** Null when every observation draws the same power (no variance to explain). */
  rSquared: number | null;
  n: number;
  xMin: number;
  xMax: number;
}

export function ordinaryLeastSquares(pairs: readonly { x: number; y: number }[]): LinearFit | null {
  const n = pairs.length;
  if (n === 0) return null;
  const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / n;
  const yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const { x, y } of pairs) {
    sxx += (x - xMean) ** 2;
    sxy += (x - xMean) * (y - yMean);
    syy += (y - yMean) ** 2;
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  const residual = pairs.reduce((sum, { x, y }) => sum + (y - (intercept + slope * x)) ** 2, 0);
  return {
    intercept,
    slope,
    rSquared: syy > 0 ? 1 - residual / syy : null,
    n,
    xMin: Math.min(...pairs.map((pair) => pair.x)),
    xMax: Math.max(...pairs.map((pair) => pair.x)),
  };
}

/**
 * Whole-deployment output tokens/s divided by every allocated GPU, so a
 * disaggregated deployment's prefill GPUs share the output they enable and its
 * mean W/GPU (averaged over all GPUs) sits on the same basis.
 */
export function outputRatePerAllocatedGpu(point: InferenceData): number | undefined {
  if (!isPositive(point.output_tput_per_gpu)) return undefined;
  const { allocatedGpus, totalOutputTokPerSec } = powerBasisNormalization({
    output_tput_per_gpu: point.output_tput_per_gpu,
    disagg: Boolean(point.disagg),
    benchmark_type: point.benchmark_type,
    num_prefill_gpu: point.num_prefill_gpu ?? 0,
    num_decode_gpu: point.num_decode_gpu ?? 0,
  });
  return isPositive(allocatedGpus) && isPositive(totalOutputTokPerSec)
    ? totalOutputTokPerSec / allocatedGpus
    : undefined;
}

export interface PowerFitObservation {
  /** Output tok/s per allocated GPU. */
  x: number;
  /** Measured mean GPU-board W/GPU. */
  y: number;
  point: InferenceData;
}

export interface PowerFit {
  source: EqualServiceSource;
  /** Rated board TDP per GPU from the hardware registry, to read `P0 ÷ TDP`; null when unknown. */
  tdpWatts: number | null;
  observations: PowerFitObservation[];
  fit: LinearFit | null;
  reason?: 'too-few-points';
}

/** One fit per equal-service source that has any measured observation. */
export function buildPowerFits(points: readonly InferenceData[]): PowerFit[] {
  const rows = observedPoints(points);
  return getEqualServiceSources(points).flatMap((source): PowerFit[] => {
    const observations = rows
      .filter((point) => equalServiceSourceKey(point) === source.key)
      .flatMap((point) => {
        const x = outputRatePerAllocatedGpu(point);
        const y = point.measuredAvgPower?.y;
        return isPositive(x) && isPositive(y) ? [{ x, y, point }] : [];
      })
      .toSorted((a, b) => a.x - b.x || (a.point.id ?? 0) - (b.point.id ?? 0));
    if (observations.length === 0) return [];
    const tdp = getGpuSpecs(observations[0].point.hwKey).tdp;
    const tdpWatts = isPositive(tdp) ? tdp : null;
    const fit =
      new Set(observations.map((observation) => observation.x)).size >= MIN_FIT_POINTS
        ? ordinaryLeastSquares(observations)
        : null;
    return [
      fit
        ? { source, tdpWatts, observations, fit }
        : { source, tdpWatts, observations, fit: null, reason: 'too-few-points' },
    ];
  });
}
