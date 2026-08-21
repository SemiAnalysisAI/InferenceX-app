import { describe, expect, it } from 'vitest';

import {
  fitLognormal,
  logHistogram,
  logTicks,
  lognormalCdf,
  lognormalCurve,
  lognormalPdf,
  normalCdf,
  positiveValues,
} from './lognormal';

/** Deterministic lognormal sample via Box-Muller over a fixed LCG. */
function lognormalSample(count: number, mu: number, sigma: number): number[] {
  let seed = 12345;
  const uniform = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed + 1) / 2147483649;
  };
  return Array.from({ length: count }, () => {
    const z = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    return Math.exp(mu + sigma * z);
  });
}

describe('normalCdf', () => {
  it('matches known standard-normal values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1)).toBeCloseTo(0.841_344_7, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(normalCdf(-8)).toBeLessThan(1e-6);
    expect(normalCdf(8)).toBeGreaterThan(1 - 1e-6);
  });
});

describe('lognormalPdf / lognormalCdf', () => {
  it('is zero at and below the origin, where the distribution has no support', () => {
    expect(lognormalPdf(0, 0, 1)).toBe(0);
    expect(lognormalPdf(-5, 0, 1)).toBe(0);
    expect(lognormalCdf(0, 0, 1)).toBe(0);
  });

  it('puts half the mass below the median exp(mu)', () => {
    expect(lognormalCdf(Math.exp(2), 2, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('integrates (crudely) to about one over its support', () => {
    let total = 0;
    const step = 0.01;
    for (let x = step; x < 200; x += step) total += lognormalPdf(x, 1, 0.8) * step;
    expect(total).toBeCloseTo(1, 2);
  });
});

describe('positiveValues', () => {
  it('drops zero, negative, and non-finite samples that cannot be logged', () => {
    expect(positiveValues([5, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, 2])).toEqual([5, 2]);
  });
});

describe('fitLognormal', () => {
  it('recovers the parameters of a known lognormal sample', () => {
    const fit = fitLognormal(lognormalSample(4000, 7.3, 0.9));
    expect(fit).not.toBeNull();
    expect(fit!.mu).toBeCloseTo(7.3, 1);
    expect(fit!.sigma).toBeCloseTo(0.9, 1);
    expect(fit!.median).toBeCloseTo(Math.exp(fit!.mu), 6);
    expect(fit!.n).toBe(4000);
  });

  it('stays finite on data no lognormal describes well', () => {
    // Two far-apart spikes: the fit is meaningless but must not blow up, since
    // the chart still draws a curve from whatever comes back.
    const bimodal = [
      ...Array.from({ length: 500 }, () => 10),
      ...Array.from({ length: 500 }, () => 100_000),
    ];
    const fit = fitLognormal(bimodal);
    expect(fit).not.toBeNull();
    expect(Number.isFinite(fit!.mu)).toBe(true);
    // Sigma has to span both modes rather than collapse onto one.
    expect(fit!.sigma).toBeGreaterThan(4);
  });

  it('ignores non-positive samples rather than producing NaN', () => {
    const fit = fitLognormal([0, -1, 100, 200, 400]);
    expect(fit).not.toBeNull();
    expect(fit!.n).toBe(3);
    expect(Number.isFinite(fit!.mu)).toBe(true);
    expect(Number.isFinite(fit!.sigma)).toBe(true);
  });

  it('returns null when there is nothing to fit', () => {
    expect(fitLognormal([])).toBeNull();
    expect(fitLognormal([0, 0, 0])).toBeNull();
    expect(fitLognormal([512])).toBeNull();
    // Zero variance in log space would give a degenerate curve.
    expect(fitLognormal([512, 512, 512])).toBeNull();
    // Summing many identical logs leaves a residual variance around 1e-32; the
    // guard has to be relative to mu, not a bare `sigma > 0`.
    expect(fitLognormal(Array.from({ length: 50 }, () => 512))).toBeNull();
    expect(fitLognormal(Array.from({ length: 1000 }, () => 40_000))).toBeNull();
  });

  it('still fits data whose spread is small but real', () => {
    const fit = fitLognormal([1000, 1001, 1002, 1003, 1004]);
    expect(fit).not.toBeNull();
    expect(fit!.sigma).toBeGreaterThan(0);
  });
});

describe('logHistogram', () => {
  it('bins with equal width in log space and counts every positive sample', () => {
    const histogram = logHistogram([1, 10, 100, 1000], 3);
    expect(histogram).not.toBeNull();
    expect(histogram!.counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(histogram!.edges).toHaveLength(4);
    // Equal ratios between edges is what "equal width in log space" means.
    const ratios = histogram!.edges.slice(1).map((edge, i) => edge / histogram!.edges[i]!);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(10, 6);
  });

  it('places the maximum sample in the last bin rather than past the end', () => {
    const histogram = logHistogram([1, 2, 4, 8, 16], 4);
    expect(histogram!.counts.at(-1)).toBeGreaterThanOrEqual(1);
    expect(histogram!.counts.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('widens a single-valued range so the spike still has a bin', () => {
    const histogram = logHistogram([256, 256, 256], 8);
    expect(histogram).not.toBeNull();
    expect(histogram!.lnMax).toBeGreaterThan(histogram!.lnMin);
    expect(histogram!.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('returns null when no sample can be logged', () => {
    expect(logHistogram([], 10)).toBeNull();
    expect(logHistogram([0, -4], 10)).toBeNull();
  });
});

describe('lognormalCurve', () => {
  it('sums to roughly the sample count, so it overlays the bars at their scale', () => {
    const values = lognormalSample(2000, 6, 0.6);
    const fit = fitLognormal(values)!;
    const histogram = logHistogram(values, 40)!;
    const curve = lognormalCurve(fit, histogram, 400);

    // Riemann sum over the curve in bin units approximates the total count.
    const lnStepBetweenSamples = (histogram.lnMax - histogram.lnMin) / (curve.length - 1);
    const area =
      curve.reduce((sum, point) => sum + point.count, 0) *
      (lnStepBetweenSamples / histogram.lnStep);
    expect(area).toBeGreaterThan(fit.n * 0.9);
    expect(area).toBeLessThan(fit.n * 1.1);
  });

  it('peaks at the fitted median', () => {
    const values = lognormalSample(2000, 6, 0.6);
    const fit = fitLognormal(values)!;
    const curve = lognormalCurve(fit, logHistogram(values, 40)!, 400);
    const peak = curve.reduce((best, point) => (point.count > best.count ? point : best));
    expect(peak.value / fit.median).toBeGreaterThan(0.9);
    expect(peak.value / fit.median).toBeLessThan(1.1);
  });
});

describe('logTicks', () => {
  it('anchors the endpoints and puts decades in between', () => {
    const ticks = logTicks(90, 120_000);
    expect(ticks[0]).toBe(90);
    expect(ticks.at(-1)).toBe(120_000);
    expect(ticks).toContain(1000);
    expect(ticks).toContain(10_000);
    expect(ticks.toSorted((a, b) => a - b)).toEqual(ticks);
  });

  it('subdivides a narrow range so the axis is not left bare', () => {
    const ticks = logTicks(100, 400);
    expect(ticks).toContain(200);
    expect(ticks.length).toBeGreaterThan(2);
  });

  it('drops a decade that would print on top of an endpoint label', () => {
    // 95 sits just below 100; both labels would collide at the axis origin.
    const ticks = logTicks(95, 100_000);
    expect(ticks[0]).toBe(95);
    expect(ticks).not.toContain(100);
    expect(ticks).toContain(1000);
  });

  it('always ends at the data maximum, even when the last decade crowds it', () => {
    // 10,200 is a hair above 10,000: the decade must yield, not the endpoint.
    const ticks = logTicks(10, 10_200);
    expect(ticks.at(-1)).toBe(10_200);
    expect(ticks).not.toContain(10_000);
  });

  it('returns nothing for a range a log axis cannot draw', () => {
    expect(logTicks(0, 100)).toEqual([]);
    expect(logTicks(100, 100)).toEqual([]);
  });
});
