import type { ComparisonCase } from '@semianalysisai/inferencex-db/operatorx/compare';

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
