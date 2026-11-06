import type {
  ComparisonCase,
  ComputePrecision,
} from '@semianalysisai/inferencex-db/operatorx/compare';

import { peakBandwidthTBs, peakTflops, scaleUpTBs } from './hardware';

/**
 * The least time a case can take on a GPU, in µs: each stage bound by its compute (at its
 * own precision's peak) or its memory traffic, whichever is slower, plus its collectives
 * over the scale-up link. Split by what bounds it.
 */
export interface RooflineBound {
  us: number;
  compute: number;
  memory: number;
  link: number;
}

/** µs per unit: FLOPs at TFLOPS, bytes at TB/s. */
const at = (amount: number, perSecond: number) => amount / (perSecond * 1e6);

/** Null when the case has no work breakdown or a peak it needs is unknown. */
export function rooflineBound(c: ComparisonCase, hw: string): RooflineBound | null {
  const bw = peakBandwidthTBs(hw);
  if (!c.work || !bw) return null;
  let compute = 0;
  let memory = 0;
  for (const p of c.work.parts) {
    // fp32 routers and the like run on the bf16 path at best
    const peak = peakTflops(hw, p.precision === 'other' ? 'bf16' : p.precision);
    if (!peak) return null;
    const [tc, tm] = [at(p.flops, peak), at(p.bytes, bw)];
    if (tc >= tm) compute += tc;
    else memory += tm;
  }
  let link = 0;
  if (c.work.links.length > 0) {
    const up = scaleUpTBs(hw);
    if (!up) return null;
    link = c.work.links.reduce((t, l) => t + at(l.bytes, up), 0);
  }
  return { us: compute + memory + link, compute, memory, link };
}

/**
 * Where a case sits against a GPU's ridge at `precision`, as a share of it: on the slope,
 * the share of peak its bound allows (its effective intensity over the ridge point); past
 * the ridge, or without a bound, plain FLOP/byte over the ridge point. At least 1 means
 * compute-bound. Null when the case has no counts or a peak is unknown.
 */
export function ridgeShare(
  c: ComparisonCase,
  hw: string,
  precision: ComputePrecision | null,
): number | null {
  const peak = precision ? peakTflops(hw, precision) : null;
  const bw = peakBandwidthTBs(hw);
  if (!peak || !bw || !c.flops || !c.bytes) return null;
  const bound = rooflineBound(c, hw);
  const reach = bound ? c.flops / (peak * 1e6) / bound.us : null;
  return reach !== null && reach < 0.999 ? reach : (c.flops / c.bytes) * (bw / peak);
}

/**
 * Whether a case is compute-bound on a GPU at `precision`: compute takes at least half its
 * roofline time (for one stage, FLOP/byte at or past the ridge point), or, without a work
 * breakdown, plain FLOP/byte at or past the ridge. False when a peak is unknown.
 */
export function computeBound(
  c: ComparisonCase,
  hw: string,
  precision: ComputePrecision | null,
): boolean {
  const peak = precision ? peakTflops(hw, precision) : null;
  const bw = peakBandwidthTBs(hw);
  if (!peak || !bw || !c.flops || !c.bytes) return false;
  const bound = rooflineBound(c, hw);
  return bound ? bound.compute >= bound.memory + bound.link : c.flops / c.bytes >= peak / bw;
}
