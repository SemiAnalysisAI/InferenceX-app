import { describe, expect, it } from 'vitest';

import { logHistogram, logTicks, positiveValues } from './lognormal';

describe('positiveValues', () => {
  it('drops zero, negative, and non-finite samples that cannot be logged', () => {
    expect(positiveValues([5, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, 2])).toEqual([5, 2]);
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

  it('handles request counts above the JavaScript variadic argument limit', () => {
    const values = Array.from({ length: 200_000 }, (_, index) => (index % 4096) + 1);

    const histogram = logHistogram(values, 32);

    expect(histogram).not.toBeNull();
    expect(histogram!.counts.reduce((sum, count) => sum + count, 0)).toBe(values.length);
    expect(histogram!.edges[0]).toBeCloseTo(1, 10);
    expect(histogram!.edges.at(-1)).toBeCloseTo(4096, 6);
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
