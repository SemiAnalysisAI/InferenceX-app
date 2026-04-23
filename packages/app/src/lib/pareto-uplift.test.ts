import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import {
  computeMeanUplift,
  computeUplift,
  formatUpliftPercent,
  interpolateY,
  sampleSLAs,
  yHigherIsBetter,
} from './pareto-uplift';

function pt(x: number, y: number, hwKey = 'h100', date = '2025-01-01'): InferenceData {
  return {
    date,
    x,
    y,
    tp: 1,
    conc: 1,
    hwKey,
    precision: 'fp8',
    tpPerGpu: { y, roof: false },
    tpPerMw: { y, roof: false },
    costh: { y, roof: false },
    costn: { y, roof: false },
    costr: { y, roof: false },
    costhi: { y, roof: false },
    costni: { y, roof: false },
    costri: { y, roof: false },
  };
}

describe('interpolateY', () => {
  it('returns null for empty curve', () => {
    expect(interpolateY([], 1)).toBeNull();
  });

  it('returns null when x is out of range', () => {
    const curve = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
    ];
    expect(interpolateY(curve, 0.5)).toBeNull();
    expect(interpolateY(curve, 2.5)).toBeNull();
  });

  it('returns the exact y at endpoints', () => {
    const curve = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
    ];
    expect(interpolateY(curve, 1)).toBe(10);
    expect(interpolateY(curve, 2)).toBe(20);
  });

  it('linearly interpolates between two points', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 10, y: 100 },
    ];
    expect(interpolateY(curve, 5)).toBe(50);
    expect(interpolateY(curve, 2.5)).toBe(25);
  });

  it('interpolates across multi-segment curves', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 10, y: 100 },
      { x: 20, y: 110 },
    ];
    expect(interpolateY(curve, 5)).toBe(50);
    expect(interpolateY(curve, 15)).toBe(105);
  });
});

describe('sampleSLAs', () => {
  it('returns 5 log-spaced points over a 100x range', () => {
    const slas = sampleSLAs(1, 100, 5);
    expect(slas).toHaveLength(5);
    expect(slas[0]).toBeCloseTo(1);
    expect(slas[4]).toBeCloseTo(100);
    expect(slas[2]).toBeCloseTo(10);
  });

  it('returns linear-spaced points when the range is <10x', () => {
    const slas = sampleSLAs(10, 50, 5);
    expect(slas).toHaveLength(5);
    expect(slas[0]).toBeCloseTo(10);
    expect(slas[2]).toBeCloseTo(30);
    expect(slas[4]).toBeCloseTo(50);
  });

  it('returns [] for invalid ranges', () => {
    expect(sampleSLAs(0, 10, 5)).toEqual([]);
    expect(sampleSLAs(10, 10, 5)).toEqual([]);
    expect(sampleSLAs(-1, 10, 5)).toEqual([]);
  });

  it('returns geometric midpoint for n=1', () => {
    expect(sampleSLAs(1, 100, 1)).toEqual([10]);
  });
});

describe('yHigherIsBetter', () => {
  it('is true for upper_* directions', () => {
    expect(yHigherIsBetter('upper_left')).toBe(true);
    expect(yHigherIsBetter('upper_right')).toBe(true);
  });

  it('is false for lower_* directions', () => {
    expect(yHigherIsBetter('lower_left')).toBe(false);
    expect(yHigherIsBetter('lower_right')).toBe(false);
  });
});

describe('computeUplift', () => {
  it('returns 1.0 geomean for identical curves', () => {
    const a = [pt(10, 100), pt(20, 200), pt(30, 250)];
    const b = [pt(10, 100), pt(20, 200), pt(30, 250)];
    const r = computeUplift(a, b, 'upper_right');
    expect(r.geomean).toBeCloseTo(1, 5);
    expect(r.coverage).toBe(1);
    expect(r.samples.length).toBeGreaterThan(0);
  });

  it('returns ~2.0 for a candidate uniformly 2x baseline throughput (upper_right)', () => {
    const baseline = [pt(10, 100), pt(20, 150), pt(30, 180)];
    const candidate = [pt(10, 200), pt(20, 300), pt(30, 360)];
    const r = computeUplift(baseline, candidate, 'upper_right');
    expect(r.geomean).toBeCloseTo(2, 2);
  });

  it('inverts ratio for lower-is-better metrics (cost)', () => {
    // lower_left front shape: y decreases as x increases. Candidate has half the y everywhere
    // → ratio (yBaseline / yCandidate) = 2, meaning candidate is 2x "better".
    const baseline = [pt(1, 4), pt(2, 2), pt(3, 1)];
    const candidate = [pt(1, 2), pt(2, 1), pt(3, 0.5)];
    const r = computeUplift(baseline, candidate, 'lower_left');
    expect(r.geomean).toBeCloseTo(2, 2);
  });

  it('returns NaN geomean and coverage=0 for disjoint x-ranges', () => {
    const a = [pt(1, 10), pt(2, 20)];
    const b = [pt(10, 100), pt(20, 200)];
    const r = computeUplift(a, b, 'upper_right');
    expect(Number.isNaN(r.geomean)).toBe(true);
    expect(r.coverage).toBe(0);
    expect(r.samples).toHaveLength(0);
  });

  it('reports partial coverage for partially-overlapping curves', () => {
    // baseline spans [1, 10]; candidate spans [5, 20]. Overlap = [5, 10], union = [1, 20].
    const baseline = [pt(1, 10), pt(5, 50), pt(10, 100)];
    const candidate = [pt(5, 50), pt(10, 100), pt(20, 150)];
    const r = computeUplift(baseline, candidate, 'upper_right');
    expect(r.coverage).toBeCloseTo(5 / 19, 3);
    expect(r.geomean).toBeCloseTo(1, 2);
    expect(r.overlapRange).toEqual({ min: 5, max: 10 });
  });

  it('handles empty inputs', () => {
    const r = computeUplift([], [pt(1, 1)], 'upper_right');
    expect(r.baselineFrontSize).toBe(0);
    expect(Number.isNaN(r.geomean)).toBe(true);
  });

  it('does not mutate input arrays', () => {
    const a = [pt(30, 300), pt(10, 100), pt(20, 200)];
    const aSnapshot = a.map((p) => ({ x: p.x, y: p.y }));
    const b = [pt(10, 120), pt(20, 220), pt(30, 320)];
    computeUplift(a, b, 'upper_right');
    expect(a.map((p) => ({ x: p.x, y: p.y }))).toEqual(aSnapshot);
  });

  it('filters non-dominated points before sampling (picks Pareto front only)', () => {
    // Baseline has a dominated point at (15, 50) that should not affect the curve.
    const baseline = [pt(10, 100), pt(15, 50), pt(20, 150), pt(30, 180)];
    const candidate = [pt(10, 200), pt(20, 300), pt(30, 360)];
    const r = computeUplift(baseline, candidate, 'upper_right');
    expect(r.geomean).toBeCloseTo(2, 2);
    expect(r.baselineFrontSize).toBeLessThan(baseline.length);
  });
});

describe('computeMeanUplift', () => {
  // Build a point with a specific ttft value; other fields use defaults.
  const pointWithTtft = (ttft: number): InferenceData => ({
    ...pt(1, 1),
    median_ttft: ttft,
  });

  it('returns 1.0 for identical averages', () => {
    const baseline = [pointWithTtft(0.5), pointWithTtft(1)];
    const candidate = [pointWithTtft(0.5), pointWithTtft(1)];
    const r = computeMeanUplift(baseline, candidate, 'median_ttft', false);
    expect(r.ratio).toBe(1);
    expect(r.meanBaseline).toBe(0.75);
    expect(r.meanCandidate).toBe(0.75);
  });

  it('inverts ratio for lower-is-better fields (TTFT)', () => {
    const baseline = [pointWithTtft(1), pointWithTtft(1)]; // mean 1.0
    const candidate = [pointWithTtft(0.5), pointWithTtft(0.5)]; // mean 0.5 (better)
    const r = computeMeanUplift(baseline, candidate, 'median_ttft', false);
    expect(r.ratio).toBe(2); // candidate (ref) is 2x better
  });

  it('keeps ratio unflipped for higher-is-better fields (interactivity)', () => {
    const baseline = [
      { ...pt(1, 1), median_intvty: 10 },
      { ...pt(1, 1), median_intvty: 20 },
    ];
    const candidate = [
      { ...pt(1, 1), median_intvty: 30 },
      { ...pt(1, 1), median_intvty: 30 },
    ];
    const r = computeMeanUplift(baseline, candidate, 'median_intvty', true);
    expect(r.ratio).toBe(2);
  });

  it('skips non-finite / non-positive values when computing the mean', () => {
    const baseline = [
      pointWithTtft(1),
      pointWithTtft(Number.NaN),
      pointWithTtft(-5),
      pointWithTtft(3),
    ];
    const candidate = [pointWithTtft(1), pointWithTtft(3)];
    const r = computeMeanUplift(baseline, candidate, 'median_ttft', false);
    expect(r.countBaseline).toBe(2);
    expect(r.meanBaseline).toBe(2);
    expect(r.ratio).toBe(1);
  });

  it('returns NaN ratio when either side has no usable values', () => {
    const baseline = [pointWithTtft(1)];
    const candidate = [pointWithTtft(Number.NaN)];
    const r = computeMeanUplift(baseline, candidate, 'median_ttft', false);
    expect(Number.isNaN(r.ratio)).toBe(true);
  });
});

describe('formatUpliftPercent', () => {
  it('formats positive uplift', () => {
    expect(formatUpliftPercent(1.173)).toBe('+17.3%');
  });

  it('formats negative uplift with a minus sign', () => {
    expect(formatUpliftPercent(0.83)).toBe('−17.0%');
  });

  it('returns "parity" for ratios near 1', () => {
    expect(formatUpliftPercent(1)).toBe('parity');
    expect(formatUpliftPercent(0.9999)).toBe('parity');
  });

  it('returns em dash for non-finite values', () => {
    expect(formatUpliftPercent(NaN)).toBe('—');
    expect(formatUpliftPercent(Infinity)).toBe('—');
  });
});
