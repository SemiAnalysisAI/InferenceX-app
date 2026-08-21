import { describe, expect, it } from 'vitest';

import {
  buildTokenLengthSketch,
  mergeTokenLengthSketches,
  tokenLengthPercentiles,
} from './token-length-sketch';

describe('token length sketch', () => {
  it('keeps percentile error below one percent', () => {
    const samples = Array.from({ length: 100_000 }, (_, index) => index + 1);
    const percentiles = tokenLengthPercentiles(buildTokenLengthSketch(samples));

    expect(percentiles?.n).toBe(100_000);
    for (const [actual, expected] of [
      [percentiles?.p50, 50_000.5],
      [percentiles?.p75, 75_000.25],
      [percentiles?.p90, 90_000.1],
      [percentiles?.p95, 95_000.05],
      [percentiles?.p99, 99_000.01],
    ] as const) {
      expect(Math.abs((actual ?? 0) - expected) / expected).toBeLessThan(0.004);
    }
  });

  it('merges point sketches with request weighting', () => {
    const smallPoint = buildTokenLengthSketch([10, 20]);
    const largePoint = buildTokenLengthSketch(Array.from({ length: 8 }, () => 1_000));
    const percentiles = tokenLengthPercentiles(mergeTokenLengthSketches([smallPoint, largePoint]));

    expect(percentiles?.n).toBe(10);
    expect(Math.abs((percentiles?.p50 ?? 0) - 1_000)).toBeLessThanOrEqual(1);
    expect(Math.abs((percentiles?.p90 ?? 0) - 1_000)).toBeLessThanOrEqual(1);
  });

  it('ignores invalid samples and preserves zero', () => {
    const percentiles = tokenLengthPercentiles(buildTokenLengthSketch([Number.NaN, -1, 0, 10]));
    expect(percentiles?.n).toBe(2);
    expect(percentiles?.p50).toBe(5);
  });
});
