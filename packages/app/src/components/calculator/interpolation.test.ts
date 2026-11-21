import { describe, expect, it } from 'bun:test';

import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
  sign,
} from './interpolation';
import type { GPUDataPoint, InterpolatedResult } from './types';

interface P {
  id: number;
  x: number;
  y: number;
}

function referenceFront(points: P[]): P[] {
  const sorted = points
    .filter((p) => !Number.isNaN(p.x) && !Number.isNaN(p.y))
    .toSorted((a, b) =>
      a.x === b.x ? (a.y === b.y ? 0 : a.y > b.y ? -1 : 1) : a.x < b.x ? -1 : 1,
    );
  const front: P[] = [];
  for (const point of sorted) {
    if (front.length > 0 && front.at(-1)!.x === point.x) {
      if (point.y > front.at(-1)!.y) front[front.length - 1] = point;
      continue;
    }
    while (front.length > 0 && point.y >= front.at(-1)!.y) front.pop();
    front.push(point);
  }
  return front;
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('paretoFrontUpperLeft', () => {
  it('matches the reference on ties and infinities, and drops NaN points, on both sides of the small-sort cutoff', () => {
    const values = [0, 1, 2, 2.5, 3, Number.NaN, Infinity, -Infinity];
    const random = seeded(7);
    const pick = () => values[Math.floor(random() * values.length)];
    for (let trial = 0; trial < 2000; trial++) {
      const n = Math.floor(random() * 40);
      const points = Array.from({ length: n }, (_, id) => ({ id, x: pick(), y: pick() }));

      const ids = paretoFrontUpperLeft(
        points,
        (p) => p.x,
        (p) => p.y,
      ).map((p) => p.id);

      expect(ids).toEqual(referenceFront(points).map((p) => p.id));
    }
  });

  it('keeps the first of exact duplicates and matches the reference with more than 32 comparable points', () => {
    const values = [0, 1, 2, 2.5, 3, Infinity, -Infinity];
    const random = seeded(11);
    const pick = () => values[Math.floor(random() * values.length)];
    for (let trial = 0; trial < 500; trial++) {
      const n = 33 + Math.floor(random() * 64);
      const points = Array.from({ length: n }, (_, id) => ({ id, x: pick(), y: pick() }));

      const ids = paretoFrontUpperLeft(
        points,
        (p) => p.x,
        (p) => p.y,
      ).map((p) => p.id);

      expect(ids).toEqual(referenceFront(points).map((p) => p.id));
    }
  });
});

describe('sign', () => {
  it('is -1 below zero and 1 at or above it', () => {
    expect([-3, -0.5, 0, 0.5, 3].map(sign)).toEqual([-1, -1, 1, 1, 1]);
  });
});

describe('monotoneSlopes', () => {
  it('returns no slope for no points and a flat slope for one point', () => {
    expect(monotoneSlopes([], [])).toEqual([]);
    expect(monotoneSlopes([5], [7])).toEqual([0]);
  });

  it('gives two points the three-point end slopes of their one secant', () => {
    // s = 2; m0 = (3·2 − 0) / 2 = 3, then m1 = (3·2 − m0) / 2 = 1.5.
    expect(monotoneSlopes([0, 2], [1, 5])).toEqual([3, 1.5]);
  });

  it('limits an interior slope by half the spacing-weighted mean secant', () => {
    // h = [1, 2], s = [1, 1.5]; p = (1·2 + 1.5·1) / 3 = 7/6, so m1 = 2 · 7/12 = 7/6;
    // m0 = (3 − 7/6) / 2 = 11/12, m2 = (4.5 − 7/6) / 2 = 5/3.
    const [m0, m1, m2] = monotoneSlopes([0, 1, 3], [0, 1, 4]);
    expect(m0).toBeCloseTo(11 / 12, 12);
    expect(m1).toBeCloseTo(7 / 6, 12);
    expect(m2).toBeCloseTo(5 / 3, 12);
  });

  it('limits an interior slope by the smaller neighbouring secant', () => {
    // s = [1, 0.25], p = 0.625: min(1, 0.25, 0.3125) = 0.25, so m1 = 0.5.
    expect(monotoneSlopes([0, 1, 2], [0, 1, 1.25])).toEqual([1.25, 0.5, 0.125]);
  });

  it('flattens a local extremum and keeps the sign of falling data', () => {
    expect(monotoneSlopes([0, 1, 2], [0, 1, 0])).toEqual([1.5, 0, -1.5]);
    // s = [−1, −3], p = −2: m1 = −2 · min(1, 3, 1) = −2.
    expect(monotoneSlopes([0, 1, 2], [4, 3, 0])).toEqual([-0.5, -2, -3.5]);
  });

  it('computes every interior slope of a longer series', () => {
    // s = [2, 1, 1], h = [1, 1, 2]: m1 = 2 · min(2, 1, 0.75) = 1.5, m2 = 2 · min(1, 1, 0.5) = 1.
    expect(monotoneSlopes([0, 1, 2, 4], [0, 2, 3, 5])).toEqual([2.25, 1.5, 1, 1]);
  });

  it('treats a repeated x as a flat secant and copies the neighbour slope at that end', () => {
    expect(monotoneSlopes([0, 0, 1], [1, 2, 3])).toEqual([0, 0, 1.5]);
    expect(monotoneSlopes([0, 1, 1], [1, 2, 3])).toEqual([1.5, 0, 0]);
    // Every spacing is zero: the weighted mean is 0/0, which falls back to a flat slope.
    expect(monotoneSlopes([1, 1, 1], [1, 2, 3])).toEqual([0, 0, 0]);
  });
});

// Cubic Hermite interpolation reproduces any cubic exactly when given its derivatives.
const cubic = (x: number) => x ** 3 - 2 * x ** 2 + 3 * x - 1;
const cubicSlope = (x: number) => 3 * x ** 2 - 4 * x + 3;

describe('hermiteInterpolate', () => {
  const xs = [1, 2.5, 3, 4.5, 7];
  const ys = xs.map(cubic);
  const m = xs.map(cubicSlope);

  it('reproduces a cubic inside every segment of an uneven grid', () => {
    for (const x of [1.6, 2.7, 3, 3.9, 6.1]) {
      expect(hermiteInterpolate(xs, ys, m, x)).toBeCloseTo(cubic(x), 9);
    }
  });

  it('interpolates within the segment that holds the target', () => {
    // Flat end slopes make each segment a smoothstep between its two values:
    // at t = 1/4 that is 27/32 of the left value plus 5/32 of the right one.
    const steps = [0, 1, 2, 3, 4];
    const values = [0, 10, 20, 40, 80];
    const flat = [0, 0, 0, 0, 0];
    expect([0.25, 1.25, 2.25, 3.25].map((x) => hermiteInterpolate(steps, values, flat, x))).toEqual(
      [1.5625, 11.5625, 23.125, 46.25],
    );
  });

  it('holds the end values outside the range instead of extrapolating', () => {
    expect(hermiteInterpolate(xs, ys, m, 0)).toBe(cubic(1));
    expect(hermiteInterpolate(xs, ys, m, 8)).toBe(cubic(7));
  });

  it('returns 0 without points and the only value with one point', () => {
    expect(hermiteInterpolate([], [], [], 3)).toBe(0);
    expect(hermiteInterpolate([2], [7], [5], 3)).toBe(7);
  });
});

describe('getCostField', () => {
  const point = {
    costh: 1,
    costr: 2,
    costhi: 3,
    costri: 4,
    costhOutput: 5,
    costrOutput: 6,
  } as GPUDataPoint;

  it('reads the provider’s total, input or output cost', () => {
    expect(getCostField(point, 'costh', 'total')).toBe(1);
    expect(getCostField(point, 'costr', 'total')).toBe(2);
    expect(getCostField(point, 'costh', 'input')).toBe(3);
    expect(getCostField(point, 'costr', 'input')).toBe(4);
    expect(getCostField(point, 'costh', 'output')).toBe(5);
    expect(getCostField(point, 'costr', 'output')).toBe(6);
  });
});

describe('recoverReciprocalNumerator', () => {
  it('returns the shared value × throughput product', () => {
    expect(recoverReciprocalNumerator([2, 4, 8], [50, 25, 12.5])).toBe(100);
    expect(recoverReciprocalNumerator([0.5], [200])).toBe(100);
    expect(recoverReciprocalNumerator([400], [0.25])).toBe(100);
  });

  it('skips pairs that are not both positive, and has nothing to recover from none', () => {
    expect(recoverReciprocalNumerator([], [])).toBeNull();
    expect(recoverReciprocalNumerator([0, 5, -1, Number.NaN, 2.5, 3], [7, 0, 3, 4, 40])).toBe(100);
    expect(recoverReciprocalNumerator([0, -2], [10, 10])).toBeNull();
  });

  it('keeps the first product within a 0.1% tolerance and gives up beyond it', () => {
    expect(recoverReciprocalNumerator([1000, 1001, 999.5], [1, 1, 1])).toBe(1000);
    expect(recoverReciprocalNumerator([1000, 1001.5], [1, 1])).toBeNull();
    expect(recoverReciprocalNumerator([1, 2], [100, 100])).toBeNull();
  });
});

describe('reciprocalMetricAt', () => {
  it('divides the numerator by a positive throughput and is 0 otherwise', () => {
    expect(reciprocalMetricAt(100, 4)).toBe(25);
    expect(reciprocalMetricAt(100, 0.5)).toBe(200);
    expect(reciprocalMetricAt(null, 4)).toBe(0);
    expect(reciprocalMetricAt(100, 0)).toBe(0);
    expect(reciprocalMetricAt(100, -4)).toBe(0);
    expect(reciprocalMetricAt(100, Number.NaN)).toBe(0);
  });
});

// Every cost is a cost rate ÷ throughput, as the calculator derives them: $720/h and $1440/h.
const RATE_H = 720;
const RATE_R = 1440;

function gpuPoint(
  interactivity: number,
  throughput: number,
  outputThroughput: number,
  overrides: Partial<GPUDataPoint> = {},
): GPUDataPoint {
  const inputThroughput = throughput - outputThroughput;
  return {
    hwKey: 'h100',
    interactivity,
    throughput,
    outputThroughput,
    inputThroughput,
    concurrency: interactivity * 0.8,
    tp: 8,
    precision: 'fp8',
    costh: RATE_H / throughput,
    costr: RATE_R / throughput,
    costhi: RATE_H / inputThroughput,
    costri: RATE_R / inputThroughput,
    costhOutput: RATE_H / outputThroughput,
    costrOutput: RATE_R / outputThroughput,
    tpPerMw: throughput * 10,
    inputTpPerMw: inputThroughput * 10,
    outputTpPerMw: outputThroughput * 10,
    cacheHitRate: interactivity / 100,
    theoreticalCacheHitRate: interactivity / 50,
    inputTokenShare: inputThroughput / throughput,
    ...overrides,
  };
}

// Throughput 400 − 10x, output 160 − 4x and input 240 − 6x along interactivity x in [10, 30];
// the point at x = 15 is dominated by the one at x = 20 and is never on the frontier.
const p10 = gpuPoint(10, 300, 120);
const p15 = gpuPoint(15, 100, 40);
const p20 = gpuPoint(20, 200, 80);
const p30 = gpuPoint(30, 100, 40);
const POINTS = [p30, p15, p10, p20];

const maxInteractivityAt = (
  target: number,
  provider: 'costh' | 'costr',
  type: 'total' | 'input' | 'output',
) => maxInteractivityAtCost(POINTS, target, provider, type);

const NUMERIC_FIELDS = [
  'value',
  'outputTputValue',
  'inputTputValue',
  'cost',
  'costInput',
  'costOutput',
  'tpPerMw',
  'inputTpPerMw',
  'outputTpPerMw',
  'cacheHitRate',
  'theoreticalCacheHitRate',
  'inputTokenShare',
  'concurrency',
] as const;

function numbers(result: InterpolatedResult | null) {
  expect(result).not.toBeNull();
  return Object.fromEntries(
    NUMERIC_FIELDS.map((key) => {
      const value = result![key];
      return [key, value === undefined ? undefined : Number(value.toFixed(9))];
    }),
  );
}

describe('interpolateForGPU', () => {
  it('returns null without points or without comparable points', () => {
    expect(interpolateForGPU([], 15, 'interactivity_to_throughput', 'costh')).toBeNull();
    expect(
      interpolateForGPU(
        [gpuPoint(Number.NaN, 300, 120)],
        15,
        'interactivity_to_throughput',
        'costh',
      ),
    ).toBeNull();
  });

  it('interpolates every metric along the frontier and prices it from the recovered cost rate', () => {
    const result = interpolateForGPU(POINTS, 15, 'interactivity_to_throughput', 'costh');

    expect(numbers(result)).toEqual({
      value: 250,
      outputTputValue: 100,
      inputTputValue: 150,
      cost: 2.88,
      costInput: 4.8,
      costOutput: 7.2,
      tpPerMw: 2500,
      inputTpPerMw: 1500,
      outputTpPerMw: 1000,
      cacheHitRate: 0.15,
      theoreticalCacheHitRate: 0.3,
      inputTokenShare: 0.6,
      concurrency: 12,
    });
    expect(result).toMatchObject({
      hwKey: 'h100',
      resultKey: 'h100',
      nearestPoints: [p10, p20],
      clamped: false,
      clampedAbove: false,
      clampedBelow: false,
    });
  });

  it('prices from the other provider’s cost rate', () => {
    const result = numbers(interpolateForGPU(POINTS, 15, 'interactivity_to_throughput', 'costr'));
    expect([result.cost, result.costInput, result.costOutput]).toEqual([5.76, 9.6, 14.4]);
  });

  it('rounds the interpolated concurrency', () => {
    // Concurrency 0.8x reads 10.4 at x = 13.
    expect(interpolateForGPU(POINTS, 13, 'interactivity_to_throughput', 'costh')!.concurrency).toBe(
      10,
    );
  });

  it('reads interactivity at a target throughput, with metrics that rise along the axis', () => {
    const result = interpolateForGPU(POINTS, 250, 'throughput_to_interactivity', 'costh');

    expect(numbers(result)).toEqual({
      value: 15,
      outputTputValue: 100,
      inputTputValue: 150,
      cost: 2.88,
      costInput: 4.8,
      costOutput: 7.2,
      tpPerMw: 2500,
      inputTpPerMw: 1500,
      outputTpPerMw: 1000,
      cacheHitRate: 0.15,
      theoreticalCacheHitRate: 0.3,
      inputTokenShare: 0.6,
      concurrency: 12,
    });
    expect(result!.nearestPoints).toEqual([p20, p10]);
  });

  it('names the measured points on each side of the target', () => {
    const nearest = [10, 20, 25, 30].map(
      (target) =>
        interpolateForGPU(POINTS, target, 'interactivity_to_throughput', 'costh')!.nearestPoints,
    );
    expect(nearest).toEqual([[p10], [p20, p30], [p20, p30], [p30]]);
  });

  it('clamps a target outside the frontier to its nearest end and flags the side', () => {
    const below = interpolateForGPU(POINTS, 5, 'interactivity_to_throughput', 'costh');
    expect(numbers(below).value).toBe(300);
    expect(below).toMatchObject({
      nearestPoints: [p10],
      clamped: true,
      clampedBelow: true,
      clampedAbove: false,
    });

    const above = interpolateForGPU(POINTS, 40, 'interactivity_to_throughput', 'costh');
    expect(numbers(above).value).toBe(100);
    expect(above).toMatchObject({
      nearestPoints: [p30],
      clamped: true,
      clampedBelow: false,
      clampedAbove: true,
    });

    for (const edge of [10, 30]) {
      expect(interpolateForGPU(POINTS, edge, 'interactivity_to_throughput', 'costh')).toMatchObject(
        { clamped: false, clampedBelow: false, clampedAbove: false },
      );
    }
  });

  it('leaves an optional metric out when any frontier point lacks it', () => {
    for (const key of ['cacheHitRate', 'theoreticalCacheHitRate', 'inputTokenShare'] as const) {
      const points = [p10, gpuPoint(20, 200, 80, { [key]: undefined }), p30];
      const result = interpolateForGPU(points, 15, 'interactivity_to_throughput', 'costh')!;
      expect(result[key]).toBeUndefined();
    }
  });

  it('reads stored costs when one cost column is not one rate ÷ its throughput', () => {
    const costsAt20 = [{ costh: 4 }, { costhi: 7 }, { costhOutput: 10 }].map((overrides) => {
      const result = interpolateForGPU(
        [p10, gpuPoint(20, 200, 80, overrides), p30],
        20,
        'interactivity_to_throughput',
        'costh',
      )!;
      return [result.cost, result.costInput, result.costOutput].map((v) => Number(v.toFixed(9)));
    });
    // Rate-consistent costs at x = 20 are 3.6 total, 6 input and 9 output.
    expect(costsAt20).toEqual([
      [4, 6, 9],
      [3.6, 7, 9],
      [3.6, 6, 10],
    ]);
  });

  it('returns a lone frontier point as measured', () => {
    const lone = gpuPoint(20, 200, 80, { concurrency: 16 });
    const result = interpolateForGPU([lone], 5, 'interactivity_to_throughput', 'costr');

    expect(result).toEqual({
      hwKey: 'h100',
      resultKey: 'h100',
      value: 200,
      outputTputValue: 80,
      inputTputValue: 120,
      cost: lone.costr,
      costInput: lone.costri,
      costOutput: lone.costrOutput,
      tpPerMw: 2000,
      inputTpPerMw: 1200,
      outputTpPerMw: 800,
      cacheHitRate: 0.2,
      theoreticalCacheHitRate: 0.4,
      inputTokenShare: 0.6,
      concurrency: 16,
      nearestPoints: [lone],
      clamped: true,
      clampedAbove: false,
      clampedBelow: true,
    });
    expect(interpolateForGPU([lone], 20, 'interactivity_to_throughput', 'costh')).toMatchObject({
      cost: lone.costh,
      costInput: lone.costhi,
      costOutput: lone.costhOutput,
      clamped: false,
    });
  });
});

describe('maxInteractivityAtCost', () => {
  it('solves for the highest interactivity whose interpolated cost fits the target', () => {
    // 720 / (400 − 10x) = 5 at x = 25.6; 1440 / (400 − 10x) = 5 at x = 11.2.
    expect(maxInteractivityAt(5, 'costh', 'total')).toBeCloseTo(25.6, 9);
    expect(maxInteractivityAt(5, 'costr', 'total')).toBeCloseTo(11.2, 9);
    expect(maxInteractivityAt(2.88, 'costh', 'total')).toBeCloseTo(15, 9);
    // 1440 / (160 − 4x) = 20 at x = 22; 720 / (240 − 6x) = 10 at x = 28.
    expect(maxInteractivityAt(20, 'costr', 'output')).toBeCloseTo(22, 9);
    expect(maxInteractivityAt(10, 'costh', 'input')).toBeCloseTo(28, 9);
  });

  it('returns the top interactivity when it already fits, and null when nothing does', () => {
    expect(maxInteractivityAt(RATE_H / 100, 'costh', 'total')).toBe(30);
    expect(maxInteractivityAt(100, 'costh', 'total')).toBe(30);
    expect(maxInteractivityAt(2, 'costh', 'total')).toBeNull();
  });

  it('splines stored costs when they are not one rate ÷ throughput', () => {
    const points = [p10, gpuPoint(20, 200, 80, { costh: 4 }), p30];
    expect(maxInteractivityAtCost(points, 4, 'costh', 'total')).toBeCloseTo(20, 9);
  });

  it('finds a target met only within the first scan step above the lowest interactivity', () => {
    // 720 / (400 − 10x) = 2.402 at x ≈ 10.025, below the first of 512 steps of (30 − 10) / 512.
    expect(maxInteractivityAt(2.402, 'costh', 'total')).toBeCloseTo((400 - RATE_H / 2.402) / 10, 9);
  });

  it('solves below 1 tok/s/user as well', () => {
    const slow = POINTS.map((p) => ({ ...p, interactivity: p.interactivity / 100 }));
    expect(maxInteractivityAtCost(slow, 5, 'costh', 'total')).toBeCloseTo(0.256, 9);
  });

  it('needs points and a positive target', () => {
    expect(maxInteractivityAtCost([], 5, 'costh', 'total')).toBeNull();
    const free = gpuPoint(20, 200, 80, { costh: 0 });
    expect(maxInteractivityAtCost([free], 0, 'costh', 'total')).toBeNull();
    expect(maxInteractivityAtCost([free], -1, 'costh', 'total')).toBeNull();
  });

  it('compares a lone frontier point’s own cost with the target', () => {
    const cheap = gpuPoint(20, 200, 80, { costh: 0.5, costrOutput: 3 });
    expect(maxInteractivityAtCost([cheap], 0.5, 'costh', 'total')).toBe(20);
    expect(maxInteractivityAtCost([cheap], 0.49, 'costh', 'total')).toBeNull();
    expect(maxInteractivityAtCost([cheap], 3, 'costr', 'output')).toBe(20);
    expect(maxInteractivityAtCost([cheap], 2.9, 'costr', 'output')).toBeNull();
  });
});
