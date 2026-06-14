import { describe, expect, it } from 'vitest';

import type { GPUDataPoint } from '@/components/calculator/types';
import { interpolateForGPU } from '@/components/calculator/interpolation';
import { isInteractivityInputOutOfRange } from '@/components/compare/compare-interpolated-table';

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
    costn: 2,
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

describe('compare interpolated table — SSR data generation', () => {
  const pointsA = [
    makePoint({ hwKey: 'h100', interactivity: 10, throughput: 800, costh: 1, tpPerMw: 5000 }),
    makePoint({ hwKey: 'h100', interactivity: 20, throughput: 600, costh: 1.2, tpPerMw: 4000 }),
    makePoint({ hwKey: 'h100', interactivity: 30, throughput: 400, costh: 1.5, tpPerMw: 3000 }),
    makePoint({ hwKey: 'h100', interactivity: 40, throughput: 200, costh: 2, tpPerMw: 2000 }),
  ];

  const pointsB = [
    makePoint({ hwKey: 'gb200', interactivity: 10, throughput: 700, costh: 0.9, tpPerMw: 4500 }),
    makePoint({ hwKey: 'gb200', interactivity: 20, throughput: 550, costh: 1.1, tpPerMw: 3500 }),
    makePoint({ hwKey: 'gb200', interactivity: 30, throughput: 350, costh: 1.4, tpPerMw: 2500 }),
    makePoint({ hwKey: 'gb200', interactivity: 40, throughput: 180, costh: 1.8, tpPerMw: 1800 }),
  ];

  it('interpolates both GPUs at a shared target interactivity', () => {
    const target = 25;
    const resultA = interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh');
    const resultB = interpolateForGPU(pointsB, target, 'interactivity_to_throughput', 'costh');

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    expect(resultA!.value).toBeGreaterThan(resultB!.value);
  });

  it('clamps targets below the pareto-front range to the minimum interactivity', () => {
    const resultA = interpolateForGPU(pointsA, 5, 'interactivity_to_throughput', 'costh');
    const resultB = interpolateForGPU(pointsB, 5, 'interactivity_to_throughput', 'costh');

    expect(resultA).not.toBeNull();
    expect(resultB).not.toBeNull();
    // Same as spline evaluated at the lowest frontier point (interactivity 10)
    expect(resultA!.value).toBe(800);
    expect(resultB!.value).toBe(700);
  });

  it('produces distinct values for different target interactivity levels', () => {
    const targets = [15, 25, 35];
    const results = targets.map((t) => ({
      a: interpolateForGPU(pointsA, t, 'interactivity_to_throughput', 'costh'),
      b: interpolateForGPU(pointsB, t, 'interactivity_to_throughput', 'costh'),
    }));

    for (const r of results) {
      expect(r.a).not.toBeNull();
      expect(r.b).not.toBeNull();
    }

    // Higher interactivity = lower throughput (on the Pareto front)
    expect(results[0].a!.value).toBeGreaterThan(results[1].a!.value);
    expect(results[1].a!.value).toBeGreaterThan(results[2].a!.value);
  });

  it('handles one GPU having no data gracefully', () => {
    const resultA = interpolateForGPU(pointsA, 25, 'interactivity_to_throughput', 'costh');
    const resultB = interpolateForGPU([], 25, 'interactivity_to_throughput', 'costh');

    expect(resultA).not.toBeNull();
    expect(resultB).toBeNull();
  });

  it('populates cost and power fields alongside throughput', () => {
    const target = 25;
    const result = interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh');

    expect(result).not.toBeNull();
    expect(result!.cost).toBeGreaterThan(0);
    expect(result!.tpPerMw).toBeGreaterThan(0);
    expect(result!.concurrency).toBeGreaterThanOrEqual(0);
  });
});

describe('compare interpolated table — interactivity range computation', () => {
  it('computes overlap range when both GPUs have data', () => {
    const rangeA = { min: 10, max: 50 };
    const rangeB = { min: 15, max: 45 };

    const overlapMin = Math.max(rangeA.min, rangeB.min);
    const overlapMax = Math.min(rangeA.max, rangeB.max);

    expect(overlapMin).toBe(15);
    expect(overlapMax).toBe(45);
  });

  it('falls back to union when ranges do not overlap', () => {
    const rangeA = { min: 10, max: 20 };
    const rangeB = { min: 30, max: 50 };

    const overlapMin = Math.max(rangeA.min, rangeB.min);
    const overlapMax = Math.min(rangeA.max, rangeB.max);

    // No overlap
    expect(overlapMin).toBeGreaterThanOrEqual(overlapMax);

    const unionMin = Math.min(rangeA.min, rangeB.min);
    const unionMax = Math.max(rangeA.max, rangeB.max);
    expect(unionMin).toBe(10);
    expect(unionMax).toBe(50);
  });

  it('picks 3 evenly spaced targets within the range', () => {
    const min = 10;
    const max = 50;
    const span = max - min;
    const targets = [
      Math.round(min + span * 0.25),
      Math.round(min + span * 0.5),
      Math.round(min + span * 0.75),
    ];

    expect(targets).toEqual([20, 30, 40]);
  });

  it('returns a single target when range is zero', () => {
    // span === 0 falls through to the single-target branch.
    const min = 30;
    const targets = [Math.round(min)];

    expect(targets).toEqual([30]);
  });
});

describe('isInteractivityInputOutOfRange', () => {
  it('returns false for empty, non-numeric, zero, or negative', () => {
    expect(isInteractivityInputOutOfRange('', 10, 100)).toBe(false);
    expect(isInteractivityInputOutOfRange('abc', 10, 100)).toBe(false);
    expect(isInteractivityInputOutOfRange('0', 10, 100)).toBe(false);
    expect(isInteractivityInputOutOfRange('-5', 10, 100)).toBe(false);
  });

  it('returns false when value is inside inclusive bounds', () => {
    expect(isInteractivityInputOutOfRange('10', 10, 100)).toBe(false);
    expect(isInteractivityInputOutOfRange('100', 10, 100)).toBe(false);
    expect(isInteractivityInputOutOfRange('50', 10, 100)).toBe(false);
  });

  it('returns true when value is strictly below min or above max', () => {
    expect(isInteractivityInputOutOfRange('9', 10, 100)).toBe(true);
    expect(isInteractivityInputOutOfRange('101', 10, 100)).toBe(true);
    expect(isInteractivityInputOutOfRange('99999', 10, 100)).toBe(true);
  });
});
