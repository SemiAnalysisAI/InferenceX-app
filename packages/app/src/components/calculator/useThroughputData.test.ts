import { describe, expect, it } from 'vitest';

import { GPUDataPoint } from './types';
import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  monotoneSlopes,
  paretoFrontUpperLeft,
  sign,
} from './useThroughputData';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePoint(overrides: Partial<GPUDataPoint> = {}): GPUDataPoint {
  return {
    hwKey: 'h100',
    interactivity: 30,
    throughput: 500,
    outputThroughput: 450,
    inputThroughput: 50,
    concurrency: 64,
    tp: 8,
    precision: 'fp8',
    costh: 1.5,
    costn: 2.0,
    costr: 1.2,
    costhi: 0.8,
    costni: 1.1,
    costri: 0.6,
    costhOutput: 2.2,
    costnOutput: 2.8,
    costrOutput: 1.8,
    tpPerMw: 1200,
    inputTpPerMw: 300,
    outputTpPerMw: 1100,
    ...overrides,
  };
}

// =========================================================================
// sign()
// =========================================================================

describe('sign', () => {
  it('returns -1 for negative numbers', () => {
    expect(sign(-5)).toBe(-1);
    expect(sign(-0.001)).toBe(-1);
  });

  it('returns 1 for zero and positive numbers', () => {
    expect(sign(0)).toBe(1);
    expect(sign(5)).toBe(1);
    expect(sign(0.001)).toBe(1);
  });
});

// =========================================================================
// getCostField()
// =========================================================================

describe('getCostField', () => {
  const p = makePoint({
    costh: 1.5,
    costn: 2.0,
    costr: 1.2,
    costhi: 0.8,
    costni: 1.1,
    costri: 0.6,
    costhOutput: 2.2,
    costnOutput: 2.8,
    costrOutput: 1.8,
  });

  it('returns total cost for each provider', () => {
    expect(getCostField(p, 'costh', 'total')).toBe(1.5);
    expect(getCostField(p, 'costn', 'total')).toBe(2.0);
    expect(getCostField(p, 'costr', 'total')).toBe(1.2);
  });

  it('returns input cost for each provider', () => {
    expect(getCostField(p, 'costh', 'input')).toBe(0.8);
    expect(getCostField(p, 'costn', 'input')).toBe(1.1);
    expect(getCostField(p, 'costr', 'input')).toBe(0.6);
  });

  it('returns output cost for each provider', () => {
    expect(getCostField(p, 'costh', 'output')).toBe(2.2);
    expect(getCostField(p, 'costn', 'output')).toBe(2.8);
    expect(getCostField(p, 'costr', 'output')).toBe(1.8);
  });
});

// =========================================================================
// paretoFrontUpperLeft()
// =========================================================================

describe('paretoFrontUpperLeft', () => {
  const getX = (p: GPUDataPoint) => p.interactivity;
  const getY = (p: GPUDataPoint) => p.throughput;

  it('returns empty array for empty input', () => {
    expect(paretoFrontUpperLeft([], getX, getY)).toEqual([]);
  });

  it('returns the single point for single-element input', () => {
    const p = makePoint({ interactivity: 10, throughput: 100 });
    const result = paretoFrontUpperLeft([p], getX, getY);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(p);
  });

  it('filters dominated points from a set of 4 points', () => {
    // Points: (10, 800), (20, 600), (30, 400), (40, 200)
    // All on the frontier (decreasing y as x increases)
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 20, throughput: 600 }),
      makePoint({ interactivity: 30, throughput: 400 }),
      makePoint({ interactivity: 40, throughput: 200 }),
    ];
    const result = paretoFrontUpperLeft(points, getX, getY);
    expect(result).toHaveLength(4);
  });

  it('removes dominated points that lie below the frontier', () => {
    // (10, 800) dominates (20, 700) which dominates (30, 300)
    // But (15, 100) is dominated by (10, 800)
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 15, throughput: 100 }), // dominated
      makePoint({ interactivity: 20, throughput: 700 }),
      makePoint({ interactivity: 30, throughput: 300 }),
    ];
    const result = paretoFrontUpperLeft(points, getX, getY);
    // The frontier should be: (10, 800), (20, 700), (30, 300)
    // (15, 100) is below 800, so it's dominated; but (20, 700) < 800 so it stays
    // Actually the algorithm is upper-left: for increasing x, y must decrease
    // (10,800) -> (20,700) y decreased, ok. (20,700) -> (30,300) y decreased, ok.
    // (15,100): x=15, y=100. After (10,800), y=100 < 800, so it gets pushed.
    // But then (20,700): y=700 >= 100, so it pops (15,100) and pushes (20,700).
    const xs = result.map(getX);
    const ys = result.map(getY);
    expect(xs).toEqual([10, 20, 30]);
    expect(ys).toEqual([800, 700, 300]);
  });

  it('handles duplicate x values by keeping highest y', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 500 }),
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 20, throughput: 400 }),
    ];
    const result = paretoFrontUpperLeft(points, getX, getY);
    // At x=10, should keep y=800
    expect(result[0].throughput).toBe(800);
  });

  it('does not mutate the input array', () => {
    const points = [
      makePoint({ interactivity: 30, throughput: 400 }),
      makePoint({ interactivity: 10, throughput: 800 }),
    ];
    const original = [...points];
    paretoFrontUpperLeft(points, getX, getY);
    expect(points).toEqual(original);
  });

  it('handles all points with the same x value', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 100 }),
      makePoint({ interactivity: 10, throughput: 300 }),
      makePoint({ interactivity: 10, throughput: 200 }),
    ];
    const result = paretoFrontUpperLeft(points, getX, getY);
    expect(result).toHaveLength(1);
    expect(result[0].throughput).toBe(300);
  });

  it('works with generic non-GPUDataPoint types', () => {
    const points = [
      { x: 10, y: 800, label: 'a' },
      { x: 20, y: 600, label: 'b' },
      { x: 15, y: 100, label: 'c' }, // dominated
      { x: 30, y: 400, label: 'd' },
    ];
    const result = paretoFrontUpperLeft(
      points,
      (p) => p.x,
      (p) => p.y,
    );
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.label)).toEqual(['a', 'b', 'd']);
  });
});

// =========================================================================
// monotoneSlopes()
// =========================================================================

describe('monotoneSlopes', () => {
  it('returns array of zeros for empty input', () => {
    expect(monotoneSlopes([], [])).toEqual([]);
  });

  it('returns [0] for single point', () => {
    expect(monotoneSlopes([1], [5])).toEqual([0]);
  });

  it('returns correct slopes for two points using Steffen endpoint formula', () => {
    const slopes = monotoneSlopes([0, 10], [0, 100]);
    expect(slopes).toHaveLength(2);
    // For 2 points: s[0] = 100/10 = 10, no interior points
    // m[0] = (3*s[0] - m[1])/2 = (30 - 0)/2 = 15 (m[1] still 0 at this point)
    // m[1] = (3*s[0] - m[0])/2 = (30 - 15)/2 = 7.5
    expect(slopes[0]).toBeCloseTo(15, 5);
    expect(slopes[1]).toBeCloseTo(7.5, 5);
  });

  it('returns correct slopes for three evenly-spaced points', () => {
    const slopes = monotoneSlopes([0, 1, 2], [0, 1, 4]);
    expect(slopes).toHaveLength(3);
    // s0 = 1, s1 = 3, h0 = h1 = 1
    // Interior: p = (1*1 + 3*1)/2 = 2, m[1] = (sign(1)+sign(3))*min(1,3,1) = 2*1 = 2
    // Hmm actually: (sign(s0)+sign(s1)) * min(|s0|,|s1|,0.5*|p|) = (1+1)*min(1,3,1) = 2
    expect(slopes[1]).toBeCloseTo(2, 5);
  });

  it('produces zero interior slope when adjacent segments have opposite signs', () => {
    // s0 = +1, s1 = -1 → sign sum = 0 → m = 0
    const slopes = monotoneSlopes([0, 1, 2], [0, 1, 0]);
    expect(slopes[1]).toBe(0);
  });

  it('returns slopes of correct length for n points', () => {
    const xs = [0, 1, 3, 6, 10];
    const ys = [0, 2, 5, 3, 8];
    const slopes = monotoneSlopes(xs, ys);
    expect(slopes).toHaveLength(5);
  });
});

// =========================================================================
// hermiteInterpolate()
// =========================================================================

describe('hermiteInterpolate', () => {
  it('returns 0 for empty arrays', () => {
    expect(hermiteInterpolate([], [], [], 5)).toBe(0);
  });

  it('returns the single y value for single-point arrays', () => {
    expect(hermiteInterpolate([5], [42], [0], 5)).toBe(42);
    // Also returns same value regardless of targetX for single point
    expect(hermiteInterpolate([5], [42], [0], 100)).toBe(42);
  });

  it('clamps to first value when targetX is below range', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const m = monotoneSlopes(xs, ys);
    expect(hermiteInterpolate(xs, ys, m, 5)).toBe(100);
  });

  it('clamps to last value when targetX is above range', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const m = monotoneSlopes(xs, ys);
    expect(hermiteInterpolate(xs, ys, m, 35)).toBe(300);
  });

  it('returns exact knot values at knot positions', () => {
    const xs = [0, 10, 20, 30];
    const ys = [0, 100, 200, 300];
    const m = monotoneSlopes(xs, ys);
    expect(hermiteInterpolate(xs, ys, m, 0)).toBeCloseTo(0, 5);
    expect(hermiteInterpolate(xs, ys, m, 10)).toBeCloseTo(100, 5);
    expect(hermiteInterpolate(xs, ys, m, 20)).toBeCloseTo(200, 5);
    expect(hermiteInterpolate(xs, ys, m, 30)).toBeCloseTo(300, 5);
  });

  it('interpolates between knots for linear data', () => {
    const xs = [0, 10, 20, 30];
    const ys = [0, 100, 200, 300];
    const m = monotoneSlopes(xs, ys);
    // For perfectly linear data, interpolation should give ~linear results
    const mid = hermiteInterpolate(xs, ys, m, 15);
    expect(mid).toBeCloseTo(150, 0);
  });

  it('produces monotone results for monotone data', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [0, 50, 120, 200, 350];
    const m = monotoneSlopes(xs, ys);

    // Sample at intermediate points and verify monotonicity
    let prev = hermiteInterpolate(xs, ys, m, 0);
    for (let x = 1; x <= 40; x++) {
      const current = hermiteInterpolate(xs, ys, m, x);
      expect(current).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = current;
    }
  });

  it('handles zero-width segment gracefully', () => {
    // Two identical x values shouldn't crash
    const xs = [10, 10, 20];
    const ys = [100, 100, 200];
    const m = monotoneSlopes(xs, ys);
    // Should not throw and should return a reasonable value
    const result = hermiteInterpolate(xs, ys, m, 10);
    expect(result).toBe(100);
  });
});

// =========================================================================
// interpolateForGPU()
// =========================================================================

describe('interpolateForGPU', () => {
  it('returns null for empty points array', () => {
    expect(interpolateForGPU([], 30, 'interactivity_to_throughput', 'costh')).toBeNull();
  });

  it('returns null when target is outside the data range', () => {
    const points = [
      makePoint({ interactivity: 20, throughput: 500 }),
      makePoint({ interactivity: 40, throughput: 300 }),
    ];
    // Below range
    expect(interpolateForGPU(points, 10, 'interactivity_to_throughput', 'costh')).toBeNull();
    // Above range
    expect(interpolateForGPU(points, 50, 'interactivity_to_throughput', 'costh')).toBeNull();
  });

  it('returns the single point value when target matches exactly', () => {
    const points = [
      makePoint({ interactivity: 30, throughput: 500, outputThroughput: 450, inputThroughput: 50 }),
    ];
    const result = interpolateForGPU(points, 30, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(500);
    expect(result!.outputTputValue).toBe(450);
    expect(result!.inputTputValue).toBe(50);
    expect(result!.hwKey).toBe('h100');
    expect(result!.resultKey).toBe('h100');
    expect(result!.nearestPoints).toHaveLength(1);
  });

  it('returns null for single point when target does not match', () => {
    const points = [makePoint({ interactivity: 30, throughput: 500 })];
    expect(interpolateForGPU(points, 25, 'interactivity_to_throughput', 'costh')).toBeNull();
  });

  it('interpolates throughput from interactivity with multiple points', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800, outputThroughput: 720, inputThroughput: 80 }),
      makePoint({ interactivity: 20, throughput: 600, outputThroughput: 540, inputThroughput: 60 }),
      makePoint({ interactivity: 30, throughput: 400, outputThroughput: 360, inputThroughput: 40 }),
      makePoint({ interactivity: 40, throughput: 200, outputThroughput: 180, inputThroughput: 20 }),
    ];
    const result = interpolateForGPU(points, 25, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(result!.hwKey).toBe('h100');
    // Total should be between 400 and 600 (interpolated)
    expect(result!.value).toBeGreaterThan(350);
    expect(result!.value).toBeLessThan(650);
    // Output should be between 360 and 540
    expect(result!.outputTputValue).toBeGreaterThan(300);
    expect(result!.outputTputValue).toBeLessThan(600);
    // Input should be between 40 and 60
    expect(result!.inputTputValue).toBeGreaterThan(30);
    expect(result!.inputTputValue).toBeLessThan(70);
  });

  it('interpolates interactivity from throughput in reverse mode', () => {
    const points = [
      makePoint({ interactivity: 800, throughput: 10 }),
      makePoint({ interactivity: 600, throughput: 20 }),
      makePoint({ interactivity: 400, throughput: 30 }),
      makePoint({ interactivity: 200, throughput: 40 }),
    ];
    const result = interpolateForGPU(points, 25, 'throughput_to_interactivity', 'costh');
    expect(result).not.toBeNull();
    // Should be between 400 and 600
    expect(result!.value).toBeGreaterThan(350);
    expect(result!.value).toBeLessThan(650);
  });

  it('uses the specified cost provider', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800, costh: 1.0, costn: 2.0, costr: 3.0 }),
      makePoint({ interactivity: 30, throughput: 400, costh: 1.5, costn: 2.5, costr: 3.5 }),
    ];
    const resultH = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh');
    const resultN = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costn');
    const resultR = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costr');

    expect(resultH).not.toBeNull();
    expect(resultN).not.toBeNull();
    expect(resultR).not.toBeNull();

    // Neocloud cost should be higher than hyperscaler, rental highest
    expect(resultN!.cost).toBeGreaterThan(resultH!.cost);
    expect(resultR!.cost).toBeGreaterThan(resultN!.cost);
  });

  it('clamps interpolated values to non-negative', () => {
    // Even if spline overshoots into negative territory, result should be >= 0
    const points = [
      makePoint({ interactivity: 10, throughput: 100, costh: 0.1 }),
      makePoint({ interactivity: 20, throughput: 50, costh: 0.05 }),
      makePoint({ interactivity: 30, throughput: 10, costh: 0.01 }),
    ];
    const result = interpolateForGPU(points, 25, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThanOrEqual(0);
    expect(result!.cost).toBeGreaterThanOrEqual(0);
    expect(result!.tpPerMw).toBeGreaterThanOrEqual(0);
    expect(result!.inputTpPerMw).toBeGreaterThanOrEqual(0);
    expect(result!.outputTpPerMw).toBeGreaterThanOrEqual(0);
  });

  it('returns bracketing nearest points', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 20, throughput: 600 }),
      makePoint({ interactivity: 30, throughput: 400 }),
    ];
    const result = interpolateForGPU(points, 15, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(result!.nearestPoints).toHaveLength(2);
    // Should bracket the target: one at x=10 and one at x=20
    const nearX = result!.nearestPoints.map((p) => p.interactivity);
    expect(nearX).toContain(10);
    expect(nearX).toContain(20);
  });

  it('filters dominated points via Pareto front', () => {
    // Create a dominated point that should be excluded from the frontier
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 15, throughput: 300 }), // dominated
      makePoint({ interactivity: 30, throughput: 400 }),
    ];
    const result = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    // The result should be based on frontier points (10,800) and (30,400),
    // not the dominated point (15,300)
    expect(result!.value).toBeGreaterThan(400);
    expect(result!.value).toBeLessThan(800);
  });

  it('rounds concurrency to nearest integer', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800, concurrency: 32 }),
      makePoint({ interactivity: 30, throughput: 400, concurrency: 128 }),
    ];
    const result = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(Number.isInteger(result!.concurrency)).toBe(true);
  });
});

// =========================================================================
// getCostField — all 9 combinations with zero and varying values
// =========================================================================

describe('getCostField — exhaustive provider × token type matrix', () => {
  it('returns all 9 correct fields for distinct cost values', () => {
    const p = makePoint({
      costh: 1.1,
      costn: 2.2,
      costr: 3.3,
      costhi: 4.4,
      costni: 5.5,
      costri: 6.6,
      costhOutput: 7.7,
      costnOutput: 8.8,
      costrOutput: 9.9,
    });

    // Total
    expect(getCostField(p, 'costh', 'total')).toBeCloseTo(1.1);
    expect(getCostField(p, 'costn', 'total')).toBeCloseTo(2.2);
    expect(getCostField(p, 'costr', 'total')).toBeCloseTo(3.3);

    // Input
    expect(getCostField(p, 'costh', 'input')).toBeCloseTo(4.4);
    expect(getCostField(p, 'costn', 'input')).toBeCloseTo(5.5);
    expect(getCostField(p, 'costr', 'input')).toBeCloseTo(6.6);

    // Output
    expect(getCostField(p, 'costh', 'output')).toBeCloseTo(7.7);
    expect(getCostField(p, 'costn', 'output')).toBeCloseTo(8.8);
    expect(getCostField(p, 'costr', 'output')).toBeCloseTo(9.9);
  });

  it('returns 0 when all cost fields are zero', () => {
    const p = makePoint({
      costh: 0,
      costn: 0,
      costr: 0,
      costhi: 0,
      costni: 0,
      costri: 0,
      costhOutput: 0,
      costnOutput: 0,
      costrOutput: 0,
    });
    expect(getCostField(p, 'costh', 'total')).toBe(0);
    expect(getCostField(p, 'costn', 'input')).toBe(0);
    expect(getCostField(p, 'costr', 'output')).toBe(0);
  });

  it('handles fractional cost values without rounding', () => {
    const p = makePoint({
      costh: 0.00123,
      costhi: 0.00456,
      costhOutput: 0.00789,
    });
    expect(getCostField(p, 'costh', 'total')).toBe(0.00123);
    expect(getCostField(p, 'costh', 'input')).toBe(0.00456);
    expect(getCostField(p, 'costh', 'output')).toBe(0.00789);
  });
});

// =========================================================================
// Multi-precision grouping key format
// =========================================================================

describe('multi-precision grouping key format', () => {
  it('uses hwKey__precision format with double underscore separator', () => {
    // Verify the convention: composite key is hwKey + "__" + precision
    const hwKey = 'gb200-nvl72-sglang';
    const precision = 'fp4';
    const compositeKey = `${hwKey}__${precision}`;

    expect(compositeKey).toBe('gb200-nvl72-sglang__fp4');
    expect(compositeKey.split('__')).toEqual(['gb200-nvl72-sglang', 'fp4']);
  });

  it('extracting hwKey from composite key strips precision suffix', () => {
    const compositeKey = 'h100-sglang__fp8';
    const hwKey = compositeKey.includes('__') ? compositeKey.split('__')[0] : compositeKey;
    expect(hwKey).toBe('h100-sglang');
  });

  it('extracting hwKey from non-composite key returns the key unchanged', () => {
    const simpleKey = 'h100-sglang';
    const hwKey = simpleKey.includes('__') ? simpleKey.split('__')[0] : simpleKey;
    expect(hwKey).toBe('h100-sglang');
  });

  it('precision is undefined for single-precision group keys', () => {
    const simpleKey = 'gb200-nvl72-sglang';
    const precision = simpleKey.includes('__') ? simpleKey.split('__')[1] : undefined;
    expect(precision).toBeUndefined();
  });

  it('precision is extracted correctly for multi-precision group keys', () => {
    const compositeKey = 'mi300x-sglang__bf16';
    const precision = compositeKey.includes('__') ? compositeKey.split('__')[1] : undefined;
    expect(precision).toBe('bf16');
  });

  it('hwKey containing hyphens does not conflict with __ separator', () => {
    // hwKeys use single hyphens; the separator is double underscore
    const compositeKey = 'gb300-nvl72-dynamo-trt-mtp__fp4';
    const parts = compositeKey.split('__');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('gb300-nvl72-dynamo-trt-mtp');
    expect(parts[1]).toBe('fp4');
  });
});

// =========================================================================
// monotoneSlopes — monotonicity preservation
// =========================================================================

describe('monotoneSlopes — monotonicity preservation', () => {
  it('produces slopes that maintain monotone interpolation for increasing data', () => {
    const xs = [0, 5, 15, 30, 50];
    const ys = [10, 40, 80, 150, 300];
    const slopes = monotoneSlopes(xs, ys);

    // All slopes should be non-negative for strictly increasing data
    for (let i = 0; i < slopes.length; i++) {
      expect(slopes[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces slopes that maintain monotone interpolation for decreasing data', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [1000, 700, 400, 200, 50];
    const slopes = monotoneSlopes(xs, ys);

    // All slopes should be non-positive for strictly decreasing data
    for (let i = 0; i < slopes.length; i++) {
      expect(slopes[i]).toBeLessThanOrEqual(0);
    }
  });

  it('produces zero slope at a local extremum (peak)', () => {
    // Data rises then falls — interior peak at x=2
    const xs = [0, 1, 2, 3, 4];
    const ys = [10, 50, 100, 50, 10];
    const slopes = monotoneSlopes(xs, ys);

    // At the peak (index 2), secant slopes change sign → slope should be 0
    expect(slopes[2]).toBe(0);
  });

  it('produces zero slope at a local extremum (valley)', () => {
    // Data falls then rises — interior valley at x=2
    const xs = [0, 1, 2, 3, 4];
    const ys = [100, 50, 10, 50, 100];
    const slopes = monotoneSlopes(xs, ys);

    // At the valley (index 2), secant slopes change sign → slope should be 0
    expect(slopes[2]).toBe(0);
  });

  it('handles unevenly spaced x values', () => {
    const xs = [0, 1, 10, 11, 100];
    const ys = [0, 10, 100, 110, 1000];
    const slopes = monotoneSlopes(xs, ys);

    expect(slopes).toHaveLength(5);
    // All slopes should be non-negative (data is increasing)
    for (const s of slopes) {
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles constant y values (flat line)', () => {
    const xs = [0, 10, 20, 30];
    const ys = [50, 50, 50, 50];
    const slopes = monotoneSlopes(xs, ys);

    // All slopes should be zero for flat data
    for (const s of slopes) {
      expect(s).toBeCloseTo(0, 10);
    }
  });
});

// =========================================================================
// hermiteInterpolate — mid-range accuracy and boundary behavior
// =========================================================================

describe('hermiteInterpolate — mid-range and boundary behavior', () => {
  it('interpolates accurately for a quadratic-like curve', () => {
    // y = x^2 sampled at x = 0, 5, 10, 15, 20
    const xs = [0, 5, 10, 15, 20];
    const ys = xs.map((x) => x * x); // [0, 25, 100, 225, 400]
    const slopes = monotoneSlopes(xs, ys);

    // At x=7.5, true y = 56.25
    const result = hermiteInterpolate(xs, ys, slopes, 7.5);
    // Cubic Hermite should be reasonably close to the true quadratic value
    expect(result).toBeGreaterThan(40);
    expect(result).toBeLessThan(75);
  });

  it('returns first y value when targetX equals first x exactly', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const slopes = monotoneSlopes(xs, ys);
    // targetX <= xs[0] → clamps to ys[0]
    expect(hermiteInterpolate(xs, ys, slopes, 10)).toBe(100);
  });

  it('returns last y value when targetX equals last x exactly', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const slopes = monotoneSlopes(xs, ys);
    // targetX >= xs[n-1] → clamps to ys[n-1]
    expect(hermiteInterpolate(xs, ys, slopes, 30)).toBe(300);
  });

  it('interpolation passes through all knot points', () => {
    const xs = [0, 3, 7, 12, 20, 35];
    const ys = [5, 30, 15, 80, 60, 100];
    const slopes = monotoneSlopes(xs, ys);

    for (let i = 0; i < xs.length; i++) {
      const result = hermiteInterpolate(xs, ys, slopes, xs[i]);
      expect(result).toBeCloseTo(ys[i], 5);
    }
  });

  it('handles two-point interpolation at midpoint', () => {
    const xs = [0, 100];
    const ys = [0, 1000];
    const slopes = monotoneSlopes(xs, ys);

    const mid = hermiteInterpolate(xs, ys, slopes, 50);
    // For 2 points, Hermite with Steffen slopes should give a value near midpoint
    // but may not be exactly 500 due to endpoint slope formula
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(700);
  });

  it('stays within y range for monotone increasing data', () => {
    const xs = [0, 10, 20, 30, 40, 50];
    const ys = [0, 15, 50, 120, 250, 400];
    const slopes = monotoneSlopes(xs, ys);

    // Sample many points and verify no overshoot below min or above max
    for (let x = 0; x <= 50; x += 0.5) {
      const result = hermiteInterpolate(xs, ys, slopes, x);
      expect(result).toBeGreaterThanOrEqual(-1e-10); // allow tiny floating point error
      expect(result).toBeLessThanOrEqual(400 + 1e-10);
    }
  });
});

// =========================================================================
// interpolateForGPU — cost provider consistency across all 3 providers
// =========================================================================

describe('interpolateForGPU — cost provider consistency', () => {
  it('interpolates distinct cost values for each provider', () => {
    // Create points where each cost provider has clearly different values
    const points = [
      makePoint({
        interactivity: 10,
        throughput: 800,
        costh: 0.5,
        costn: 1.0,
        costr: 0.3,
        costhi: 0.25,
        costni: 0.5,
        costri: 0.15,
        costhOutput: 0.75,
        costnOutput: 1.5,
        costrOutput: 0.45,
      }),
      makePoint({
        interactivity: 30,
        throughput: 400,
        costh: 0.8,
        costn: 1.6,
        costr: 0.48,
        costhi: 0.4,
        costni: 0.8,
        costri: 0.24,
        costhOutput: 1.2,
        costnOutput: 2.4,
        costrOutput: 0.72,
      }),
    ];

    const resultH = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh')!;
    const resultN = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costn')!;
    const resultR = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costr')!;

    // Same throughput value regardless of cost provider (cost doesn't affect throughput)
    expect(resultH.value).toBeCloseTo(resultN.value, 5);
    expect(resultH.value).toBeCloseTo(resultR.value, 5);

    // But costs should differ across providers
    expect(resultH.cost).not.toBeCloseTo(resultN.cost, 1);
    expect(resultH.costInput).not.toBeCloseTo(resultN.costInput, 1);
    expect(resultH.costOutput).not.toBeCloseTo(resultN.costOutput, 1);

    // Neocloud costs are ~2x hyperscaler in this test data
    expect(resultN.cost).toBeGreaterThan(resultH.cost);
    expect(resultN.costInput).toBeGreaterThan(resultH.costInput);
    expect(resultN.costOutput).toBeGreaterThan(resultH.costOutput);
  });

  it('interpolated tpPerMw values are independent of cost provider', () => {
    const points = [
      makePoint({
        interactivity: 10,
        throughput: 800,
        tpPerMw: 5000,
        inputTpPerMw: 1000,
        outputTpPerMw: 4500,
      }),
      makePoint({
        interactivity: 30,
        throughput: 400,
        tpPerMw: 3000,
        inputTpPerMw: 600,
        outputTpPerMw: 2700,
      }),
    ];

    const resultH = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh')!;
    const resultN = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costn')!;

    // tpPerMw should be identical regardless of cost provider
    expect(resultH.tpPerMw).toBeCloseTo(resultN.tpPerMw, 5);
    expect(resultH.inputTpPerMw).toBeCloseTo(resultN.inputTpPerMw, 5);
    expect(resultH.outputTpPerMw).toBeCloseTo(resultN.outputTpPerMw, 5);
  });
});

// =========================================================================
// paretoFrontUpperLeft — additional edge cases
// =========================================================================

describe('paretoFrontUpperLeft — additional edge cases', () => {
  it('handles a strictly increasing y with increasing x (all dominated except last)', () => {
    // If y increases with x, each subsequent point dominates prior ones
    // upper-left: we want decreasing y for increasing x
    const points = [
      { x: 10, y: 100 },
      { x: 20, y: 200 },
      { x: 30, y: 300 },
      { x: 40, y: 400 },
    ];
    const result = paretoFrontUpperLeft(
      points,
      (p) => p.x,
      (p) => p.y,
    );
    // Only the last point survives — each subsequent point has higher y, popping the previous
    expect(result).toHaveLength(1);
    expect(result[0].y).toBe(400);
  });

  it('preserves all points when y is strictly decreasing with increasing x', () => {
    const points = [
      { x: 10, y: 400 },
      { x: 20, y: 300 },
      { x: 30, y: 200 },
      { x: 40, y: 100 },
    ];
    const result = paretoFrontUpperLeft(
      points,
      (p) => p.x,
      (p) => p.y,
    );
    expect(result).toHaveLength(4);
  });

  it('handles large input without performance issues', () => {
    // 1000 random-ish points
    const points = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      y: 1000 - i + Math.sin(i) * 50,
    }));
    const result = paretoFrontUpperLeft(
      points,
      (p) => p.x,
      (p) => p.y,
    );
    // Should return at least 1 point and complete quickly
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Frontier should be valid: y decreasing for increasing x
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThan(result[i - 1].x);
      expect(result[i].y).toBeLessThan(result[i - 1].y);
    }
  });
});
