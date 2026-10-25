import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { Percentile, Sequence } from '@/lib/catalog/data-mappings';
import { overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { SUPPLEMENTAL_BENCHMARK_ROWS } from '@/lib/benchmarks/supplemental-benchmarks';
import { toCalculatorBenchmarkRows } from '@/lib/benchmarks/benchmark-api-view';

import type { GPUDataPoint } from './types';
import {
  buildGpuGroups,
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  recoverReciprocalNumerator,
  sign,
} from './useThroughputData';

const PYTHON_INTERPOLATION_HELPER = resolve(
  import.meta.dirname,
  '../../../../..',
  '.claude/skills/write-inferencex-blog/iso_interactivity.py',
);

const classifyByHardware = (hwKey: string) => ({ key: hwKey, meta: { hwKey } });

function interpolateWithPython(request: Record<string, unknown>): number | null {
  const result = spawnSync('python3', [PYTHON_INTERPOLATION_HELPER], {
    input: JSON.stringify(request),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Python interpolation failed: ${result.stderr}`);
  return (JSON.parse(result.stdout) as { value: number | null }).value;
}

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
    costr: 1.2,
    costhi: 0.8,
    costri: 0.6,
    costhOutput: 2.2,
    costrOutput: 1.8,
    tpPerMw: 1200,
    inputTpPerMw: 300,
    outputTpPerMw: 1100,
    ...overrides,
  };
}

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

describe('snapshot token-metric capabilities', () => {
  const julyVrRows = SUPPLEMENTAL_BENCHMARK_ROWS.filter((row) => row.hardware === 'vr200');
  const options = {
    sequence: Sequence.EightK_OneK,
    precisions: ['fp4'],
    classify: classifyByHardware,
  };

  it('keeps July VR200 for output calculator metrics and hides total/input', () => {
    expect(
      Object.keys(buildGpuGroups(julyVrRows, { ...options, tokenType: 'output' }).grouped),
    ).toEqual(['vr200_rubin-july']);
    expect(buildGpuGroups(julyVrRows, { ...options, tokenType: 'total' }).grouped).toEqual({});
    expect(buildGpuGroups(julyVrRows, { ...options, tokenType: 'input' }).grouped).toEqual({});
  });

  it('applies the same restriction to unofficial overlay rows', () => {
    const overlayRows = julyVrRows.map((row) => ({
      ...row,
      run_url: 'https://github.com/org/repo/actions/runs/1',
    }));
    expect(buildGpuGroups(overlayRows, { ...options, tokenType: 'total' }).grouped).toEqual({});
  });
});

describe('getCostField', () => {
  const p = makePoint({
    costh: 1.5,
    costr: 1.2,
    costhi: 0.8,
    costri: 0.6,
    costhOutput: 2.2,
    costrOutput: 1.8,
  });

  it('returns total cost for each provider', () => {
    expect(getCostField(p, 'costh', 'total')).toBe(1.5);
    expect(getCostField(p, 'costr', 'total')).toBe(1.2);
  });

  it('returns input cost for each provider', () => {
    expect(getCostField(p, 'costh', 'input')).toBe(0.8);
    expect(getCostField(p, 'costr', 'input')).toBe(0.6);
  });

  it('returns output cost for each provider', () => {
    expect(getCostField(p, 'costh', 'output')).toBe(2.2);
    expect(getCostField(p, 'costr', 'output')).toBe(1.8);
  });
});

const getParetoX = (p: GPUDataPoint) => p.interactivity;
const getParetoY = (p: GPUDataPoint) => p.throughput;

describe('paretoFrontUpperLeft', () => {
  it('returns empty array for empty input', () => {
    expect(paretoFrontUpperLeft([], getParetoX, getParetoY)).toEqual([]);
  });

  it('returns the single point for single-element input', () => {
    const p = makePoint({ interactivity: 10, throughput: 100 });
    const result = paretoFrontUpperLeft([p], getParetoX, getParetoY);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(p);
  });

  it('filters dominated points from a set of 4 points', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 20, throughput: 600 }),
      makePoint({ interactivity: 30, throughput: 400 }),
      makePoint({ interactivity: 40, throughput: 200 }),
    ];
    const result = paretoFrontUpperLeft(points, getParetoX, getParetoY);
    expect(result).toHaveLength(4);
  });

  it('removes dominated points that lie below the frontier', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 15, throughput: 100 }),
      makePoint({ interactivity: 20, throughput: 700 }),
      makePoint({ interactivity: 30, throughput: 300 }),
    ];
    const result = paretoFrontUpperLeft(points, getParetoX, getParetoY);
    const xs = result.map(getParetoX);
    const ys = result.map(getParetoY);
    expect(xs).toEqual([10, 20, 30]);
    expect(ys).toEqual([800, 700, 300]);
  });

  it('handles duplicate x values by keeping highest y', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 500 }),
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 20, throughput: 400 }),
    ];
    const result = paretoFrontUpperLeft(points, getParetoX, getParetoY);
    expect(result[0].throughput).toBe(800);
  });

  it('does not mutate the input array', () => {
    const points = [
      makePoint({ interactivity: 30, throughput: 400 }),
      makePoint({ interactivity: 10, throughput: 800 }),
    ];
    const original = [...points];
    paretoFrontUpperLeft(points, getParetoX, getParetoY);
    expect(points).toEqual(original);
  });

  it('handles all points with the same x value', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 100 }),
      makePoint({ interactivity: 10, throughput: 300 }),
      makePoint({ interactivity: 10, throughput: 200 }),
    ];
    const result = paretoFrontUpperLeft(points, getParetoX, getParetoY);
    expect(result).toHaveLength(1);
    expect(result[0].throughput).toBe(300);
  });

  it('works with generic non-GPUDataPoint types', () => {
    const points = [
      { x: 10, y: 800, label: 'a' },
      { x: 20, y: 600, label: 'b' },
      { x: 15, y: 100, label: 'c' },
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
    expect(slopes[0]).toBeCloseTo(15, 5);
    expect(slopes[1]).toBeCloseTo(7.5, 5);
  });

  it('returns correct slopes for three evenly-spaced points', () => {
    const slopes = monotoneSlopes([0, 1, 2], [0, 1, 4]);
    expect(slopes).toHaveLength(3);
    expect(slopes[1]).toBeCloseTo(2, 5);
  });

  it('produces zero interior slope when adjacent segments have opposite signs', () => {
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

describe('hermiteInterpolate', () => {
  it('returns 0 for empty arrays', () => {
    expect(hermiteInterpolate([], [], [], 5)).toBe(0);
  });

  it('returns the single y value for single-point arrays', () => {
    expect(hermiteInterpolate([5], [42], [0], 5)).toBe(42);
    expect(hermiteInterpolate([5], [42], [0], 100)).toBe(42);
  });

  it('clamps to first value when targetParetoX is below range', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const m = monotoneSlopes(xs, ys);
    expect(hermiteInterpolate(xs, ys, m, 5)).toBe(100);
  });

  it('clamps to last value when targetParetoX is above range', () => {
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
    const mid = hermiteInterpolate(xs, ys, m, 15);
    expect(mid).toBeCloseTo(150, 0);
  });

  it('produces monotone results for monotone data', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [0, 50, 120, 200, 350];
    const m = monotoneSlopes(xs, ys);

    let prev = hermiteInterpolate(xs, ys, m, 0);
    for (let x = 1; x <= 40; x++) {
      const current = hermiteInterpolate(xs, ys, m, x);
      expect(current).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = current;
    }
  });

  it('handles zero-width segment gracefully', () => {
    const xs = [10, 10, 20];
    const ys = [100, 100, 200];
    const m = monotoneSlopes(xs, ys);
    const result = hermiteInterpolate(xs, ys, m, 10);
    expect(result).toBe(100);
  });
});

describe('interpolateForGPU', () => {
  it('returns null for empty points array', () => {
    expect(interpolateForGPU([], 30, 'interactivity_to_throughput', 'costh')).toBeNull();
  });

  it('clamps target to the pareto-front input range instead of returning null', () => {
    const points = [
      makePoint({ interactivity: 20, throughput: 500, tp: 4 }),
      makePoint({ interactivity: 40, throughput: 300, tp: 8 }),
    ];
    const below = interpolateForGPU(points, 10, 'interactivity_to_throughput', 'costh');
    const above = interpolateForGPU(points, 50, 'interactivity_to_throughput', 'costh');
    expect(below).not.toBeNull();
    expect(above).not.toBeNull();
    expect(below!.value).toBe(500);
    expect(above!.value).toBe(300);
    expect(below!.nearestPoints).toEqual([expect.objectContaining({ interactivity: 20, tp: 4 })]);
    expect(above!.nearestPoints).toEqual([expect.objectContaining({ interactivity: 40, tp: 8 })]);
  });

  it('uses the exact endpoint as the sole metadata source', () => {
    const points = [
      makePoint({ interactivity: 20, throughput: 500, tp: 4 }),
      makePoint({ interactivity: 40, throughput: 300, tp: 8 }),
    ];

    const result = interpolateForGPU(points, 40, 'interactivity_to_throughput', 'costh');

    expect(result?.nearestPoints).toEqual([expect.objectContaining({ interactivity: 40, tp: 8 })]);
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

  describe('cached-input fraction', () => {
    const withCache = (rates: (number | undefined)[]) =>
      rates.map((cacheHitRate, i) =>
        makePoint({
          interactivity: 20 + i * 20,
          throughput: 500 - i * 100,
          inputThroughput: 400 - i * 80,
          ...(cacheHitRate === undefined ? {} : { cacheHitRate }),
        }),
      );

    it('interpolates the rate between measured points', () => {
      const result = interpolateForGPU(
        withCache([0.4, 0.8]),
        30,
        'interactivity_to_throughput',
        'costh',
      );
      expect(result!.cacheHitRate).toBeGreaterThan(0.4);
      expect(result!.cacheHitRate).toBeLessThan(0.8);
    });

    it('stays inside the frontier range rather than overshooting', () => {
      const result = interpolateForGPU(
        withCache([0.1, 0.9, 0.2]),
        45,
        'interactivity_to_throughput',
        'costh',
      );
      expect(result!.cacheHitRate).toBeGreaterThanOrEqual(0.1);
      expect(result!.cacheHitRate).toBeLessThanOrEqual(0.9);
    });

    it('is undefined when no point carries a rate — every fixed sequence', () => {
      const result = interpolateForGPU(
        withCache([undefined, undefined]),
        30,
        'interactivity_to_throughput',
        'costh',
      );
      expect(result!.cacheHitRate).toBeUndefined();
    });

    it('opts the whole frontier out when only some points carry a rate', () => {
      const result = interpolateForGPU(
        withCache([0.9, undefined]),
        30,
        'interactivity_to_throughput',
        'costh',
      );
      expect(result!.cacheHitRate).toBeUndefined();
    });

    it('carries the rate through the single-point path too', () => {
      const points = [makePoint({ interactivity: 30, throughput: 500, cacheHitRate: 0.77 })];
      const result = interpolateForGPU(points, 25, 'interactivity_to_throughput', 'costh');
      expect(result!.cacheHitRate).toBe(0.77);
    });
  });

  it('single GPU clamps any target to the lone pareto-front point', () => {
    const points = [makePoint({ interactivity: 30, throughput: 500 })];
    const result = interpolateForGPU(points, 25, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(500);
    expect(result!.nearestPoints).toHaveLength(1);
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
    expect(result!.value).toBeGreaterThan(350);
    expect(result!.value).toBeLessThan(650);
    expect(result!.outputTputValue).toBeGreaterThan(300);
    expect(result!.outputTputValue).toBeLessThan(600);
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
    expect(result!.value).toBeGreaterThan(350);
    expect(result!.value).toBeLessThan(650);
  });

  it('uses the specified cost provider', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800, costh: 1, costr: 3 }),
      makePoint({ interactivity: 30, throughput: 400, costh: 1.5, costr: 3.5 }),
    ];
    const resultH = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh');
    const resultR = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costr');

    expect(resultH).not.toBeNull();
    expect(resultR).not.toBeNull();

    expect(resultR!.cost).toBeGreaterThan(resultH!.cost);
  });

  it('clamps interpolated values to non-negative', () => {
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
    const nearX = result!.nearestPoints.map((p) => p.interactivity);
    expect(nearX).toContain(10);
    expect(nearX).toContain(20);
  });

  it('filters dominated points via Pareto front', () => {
    const points = [
      makePoint({ interactivity: 10, throughput: 800 }),
      makePoint({ interactivity: 15, throughput: 300 }),
      makePoint({ interactivity: 30, throughput: 400 }),
    ];
    const result = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh');
    expect(result).not.toBeNull();
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

describe('getCostField — exhaustive provider × token type matrix', () => {
  it('returns all 9 correct fields for distinct cost values', () => {
    const p = makePoint({
      costh: 1.1,
      costr: 3.3,
      costhi: 4.4,
      costri: 6.6,
      costhOutput: 7.7,
      costrOutput: 9.9,
    });

    expect(getCostField(p, 'costh', 'total')).toBeCloseTo(1.1);
    expect(getCostField(p, 'costr', 'total')).toBeCloseTo(3.3);

    expect(getCostField(p, 'costh', 'input')).toBeCloseTo(4.4);
    expect(getCostField(p, 'costr', 'input')).toBeCloseTo(6.6);

    expect(getCostField(p, 'costh', 'output')).toBeCloseTo(7.7);
    expect(getCostField(p, 'costr', 'output')).toBeCloseTo(9.9);
  });

  it('returns 0 when all cost fields are zero', () => {
    const p = makePoint({
      costh: 0,
      costr: 0,
      costhi: 0,
      costri: 0,
      costhOutput: 0,
      costrOutput: 0,
    });
    expect(getCostField(p, 'costh', 'total')).toBe(0);
    expect(getCostField(p, 'costh', 'input')).toBe(0);
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

describe('multi-precision grouping key format', () => {
  it('uses hwKey__precision format with double underscore separator', () => {
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
    const compositeKey = 'gb300-nvl72-dynamo-trt-mtp__fp4';
    const parts = compositeKey.split('__');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('gb300-nvl72-dynamo-trt-mtp');
    expect(parts[1]).toBe('fp4');
  });
});

describe('monotoneSlopes — monotonicity preservation', () => {
  it('produces slopes that maintain monotone interpolation for increasing data', () => {
    const xs = [0, 5, 15, 30, 50];
    const ys = [10, 40, 80, 150, 300];
    const slopes = monotoneSlopes(xs, ys);

    for (const slope of slopes) {
      expect(slope).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces slopes that maintain monotone interpolation for decreasing data', () => {
    const xs = [0, 10, 20, 30, 40];
    const ys = [1000, 700, 400, 200, 50];
    const slopes = monotoneSlopes(xs, ys);

    for (const slope of slopes) {
      expect(slope).toBeLessThanOrEqual(0);
    }
  });

  it('produces zero slope at a local extremum (peak)', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [10, 50, 100, 50, 10];
    const slopes = monotoneSlopes(xs, ys);

    expect(slopes[2]).toBe(0);
  });

  it('produces zero slope at a local extremum (valley)', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [100, 50, 10, 50, 100];
    const slopes = monotoneSlopes(xs, ys);

    expect(slopes[2]).toBe(0);
  });

  it('handles unevenly spaced x values', () => {
    const xs = [0, 1, 10, 11, 100];
    const ys = [0, 10, 100, 110, 1000];
    const slopes = monotoneSlopes(xs, ys);

    expect(slopes).toHaveLength(5);
    for (const s of slopes) {
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles constant y values (flat line)', () => {
    const xs = [0, 10, 20, 30];
    const ys = [50, 50, 50, 50];
    const slopes = monotoneSlopes(xs, ys);

    for (const s of slopes) {
      expect(s).toBeCloseTo(0, 10);
    }
  });
});

describe('hermiteInterpolate — mid-range and boundary behavior', () => {
  it('interpolates accurately for a quadratic-like curve', () => {
    const xs = [0, 5, 10, 15, 20];
    const ys = xs.map((x) => x * x);
    const slopes = monotoneSlopes(xs, ys);

    const result = hermiteInterpolate(xs, ys, slopes, 7.5);
    expect(result).toBeGreaterThan(40);
    expect(result).toBeLessThan(75);
  });

  it('returns first y value when targetParetoX equals first x exactly', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const slopes = monotoneSlopes(xs, ys);
    expect(hermiteInterpolate(xs, ys, slopes, 10)).toBe(100);
  });

  it('returns last y value when targetParetoX equals last x exactly', () => {
    const xs = [10, 20, 30];
    const ys = [100, 200, 300];
    const slopes = monotoneSlopes(xs, ys);
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
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(700);
  });

  it('stays within y range for monotone increasing data', () => {
    const xs = [0, 10, 20, 30, 40, 50];
    const ys = [0, 15, 50, 120, 250, 400];
    const slopes = monotoneSlopes(xs, ys);

    for (let x = 0; x <= 50; x += 0.5) {
      const result = hermiteInterpolate(xs, ys, slopes, x);
      expect(result).toBeGreaterThanOrEqual(-1e-10);
      expect(result).toBeLessThanOrEqual(400 + 1e-10);
    }
  });
});

describe('interpolateForGPU — cost provider consistency', () => {
  it('interpolates distinct cost values for each provider', () => {
    const points = [
      makePoint({
        interactivity: 10,
        throughput: 800,
        costh: 0.5,
        costr: 0.3,
        costhi: 0.25,
        costri: 0.15,
        costhOutput: 0.75,
        costrOutput: 0.45,
      }),
      makePoint({
        interactivity: 30,
        throughput: 400,
        costh: 0.8,
        costr: 0.48,
        costhi: 0.4,
        costri: 0.24,
        costhOutput: 1.2,
        costrOutput: 0.72,
      }),
    ];

    const resultH = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costh')!;
    const resultR = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costr')!;

    expect(resultH.value).toBeCloseTo(resultR.value, 5);

    expect(resultH.cost).not.toBeCloseTo(resultR.cost, 1);
    expect(resultH.costInput).not.toBeCloseTo(resultR.costInput, 1);
    expect(resultH.costOutput).not.toBeCloseTo(resultR.costOutput, 1);

    expect(resultR.cost).toBeLessThan(resultH.cost);
    expect(resultR.costInput).toBeLessThan(resultH.costInput);
    expect(resultR.costOutput).toBeLessThan(resultH.costOutput);
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
    const resultR = interpolateForGPU(points, 20, 'interactivity_to_throughput', 'costr')!;

    expect(resultH.tpPerMw).toBeCloseTo(resultR.tpPerMw, 5);
    expect(resultH.inputTpPerMw).toBeCloseTo(resultR.inputTpPerMw, 5);
    expect(resultH.outputTpPerMw).toBeCloseTo(resultR.outputTpPerMw, 5);
  });
});

describe('paretoFrontUpperLeft — additional edge cases', () => {
  it('handles a strictly increasing y with increasing x (all dominated except last)', () => {
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
    const points = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      y: 1000 - i + Math.sin(i) * 50,
    }));
    const result = paretoFrontUpperLeft(
      points,
      (p) => p.x,
      (p) => p.y,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].x).toBeGreaterThan(result[i - 1].x);
      expect(result[i].y).toBeLessThan(result[i - 1].y);
    }
  });
});

describe('maxInteractivityAtCost', () => {
  const monotonePoints = [
    makePoint({ interactivity: 10, throughput: 1000, costh: 0.2, costr: 0.4, costhi: 1 }),
    makePoint({ interactivity: 20, throughput: 800, costh: 0.4, costr: 0.8, costhi: 0.5 }),
    makePoint({ interactivity: 30, throughput: 500, costh: 0.8, costr: 1.6, costhi: 1.5 }),
    makePoint({ interactivity: 40, throughput: 200, costh: 2, costr: 4, costhi: 0.9 }),
  ];

  it('returns null for empty input', () => {
    expect(maxInteractivityAtCost([], 1, 'costh', 'total')).toBeNull();
  });

  it('returns null for a non-positive cost target', () => {
    expect(maxInteractivityAtCost(monotonePoints, 0, 'costh', 'total')).toBeNull();
    expect(maxInteractivityAtCost(monotonePoints, -1, 'costh', 'total')).toBeNull();
  });

  it('returns the single point interactivity when affordable, null otherwise', () => {
    const single = [makePoint({ interactivity: 25, throughput: 600, costh: 0.5 })];
    expect(maxInteractivityAtCost(single, 0.5, 'costh', 'total')).toBe(25);
    expect(maxInteractivityAtCost(single, 0.4, 'costh', 'total')).toBeNull();
  });

  it('returns the frontier max when the whole curve is affordable', () => {
    expect(maxInteractivityAtCost(monotonePoints, 2, 'costh', 'total')).toBe(40);
    expect(maxInteractivityAtCost(monotonePoints, 100, 'costh', 'total')).toBe(40);
  });

  it('returns null when even the cheapest operating point exceeds the target', () => {
    expect(maxInteractivityAtCost(monotonePoints, 0.1, 'costh', 'total')).toBeNull();
  });

  it('finds the crossing interactivity on a monotone cost curve', () => {
    const iv = maxInteractivityAtCost(monotonePoints, 0.4, 'costh', 'total');
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(20, 1);
  });

  it('returns an interactivity between the bracketing knots for an intermediate target', () => {
    const iv = maxInteractivityAtCost(monotonePoints, 0.3, 'costh', 'total');
    expect(iv).not.toBeNull();
    expect(iv!).toBeGreaterThan(10);
    expect(iv!).toBeLessThan(20);
  });

  it('is consistent with interpolateForGPU: cost at the returned iv stays within budget', () => {
    const target = 0.6;
    const iv = maxInteractivityAtCost(monotonePoints, target, 'costh', 'total');
    expect(iv).not.toBeNull();
    const at = interpolateForGPU(monotonePoints, iv!, 'interactivity_to_throughput', 'costh');
    expect(at).not.toBeNull();
    expect(at!.cost).toBeLessThanOrEqual(target + 1e-6);
    const above = interpolateForGPU(
      monotonePoints,
      iv! + 0.5,
      'interactivity_to_throughput',
      'costh',
    );
    expect(above!.cost).toBeGreaterThan(target);
  });

  it('respects the cost provider', () => {
    const ivH = maxInteractivityAtCost(monotonePoints, 0.8, 'costh', 'total');
    const ivR = maxInteractivityAtCost(monotonePoints, 0.8, 'costr', 'total');
    expect(ivH).not.toBeNull();
    expect(ivR).not.toBeNull();
    expect(ivR!).toBeLessThan(ivH!);
  });

  it('handles non-monotone cost curves (input-token cost) by returning the highest affordable iv', () => {
    expect(maxInteractivityAtCost(monotonePoints, 0.95, 'costh', 'input')).toBe(40);

    const iv = maxInteractivityAtCost(monotonePoints, 0.6, 'costh', 'input');
    expect(iv).not.toBeNull();
    expect(iv!).toBeGreaterThanOrEqual(20);
    expect(iv!).toBeLessThan(30);
  });

  it('only considers frontier points (dominated points are ignored)', () => {
    const withDominated = [
      ...monotonePoints,
      makePoint({ interactivity: 15, throughput: 700, costh: 0.05 }),
    ];
    expect(maxInteractivityAtCost(withDominated, 0.1, 'costh', 'total')).toBeNull();
  });
});

function makeRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'b300',
    framework: 'sglang',
    model: 'dsv4',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 8,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 1024,
    osl: 1024,
    conc: 8,
    offload_mode: 'off',
    image: 'sglang:test',
    metrics: {
      median_intvty: 50,
      tput_per_gpu: 900,
      output_tput_per_gpu: 300,
      input_tput_per_gpu: 600,
    },
    date: '2026-07-19',
    run_url: null,
    ...overrides,
  };
}

const singlePrecisionClassify = (hwKey: string) => ({ key: hwKey, meta: { hwKey } });

describe('buildGpuGroups', () => {
  const shared = { sequence: Sequence.OneK_OneK, precisions: ['fp4'] };

  it('groups rows by the caller-supplied key and derives cost + power metrics', () => {
    const { grouped, groupMeta, hwConfigMap } = buildGpuGroups(
      [
        makeRow({ conc: 8 }),
        makeRow({ conc: 16, metrics: { median_intvty: 30, tput_per_gpu: 1500 } }),
      ],
      { ...shared, classify: singlePrecisionClassify },
    );

    const keys = Object.keys(grouped);
    expect(keys).toHaveLength(1);
    const [hwKey] = keys;
    expect(grouped[hwKey]).toHaveLength(2);
    expect(groupMeta[hwKey]).toEqual({ hwKey });
    expect(hwConfigMap[hwKey]).toBeDefined();

    const [first] = grouped[hwKey];
    expect(first.interactivity).toBe(50);
    expect(first.throughput).toBe(900);
    expect(first.concurrency).toBe(8);
    expect(first.costh).toBeGreaterThan(0);
    expect(first.tpPerMw).toBeGreaterThan(0);
  });

  describe('time to first token', () => {
    const only = (row: BenchmarkRow, sequence = Sequence.OneK_OneK, percentile?: Percentile) => {
      const { grouped } = buildGpuGroups([row], {
        sequence,
        precisions: ['fp4'],
        percentile,
        classify: singlePrecisionClassify,
      });
      return Object.values(grouped)[0][0];
    };

    it('reads the median for fixed-sequence rows, matching the inference TTFT axis', () => {
      const point = only(
        makeRow({
          metrics: { median_intvty: 50, tput_per_gpu: 900, median_ttft: 0.8, p90_ttft: 2.4 },
        }),
      );
      expect(point.ttft).toBe(0.8);
    });

    it('reads the selected percentile for agentic rows', () => {
      const agentic = (percentile: Percentile) =>
        only(
          makeRow({
            benchmark_type: 'agentic_traces',
            isl: null,
            osl: null,
            metrics: {
              p75_itl: 1 / 200,
              p90_itl: 1 / 160,
              p75_e2el: 20,
              p90_e2el: 30,
              tput_per_gpu: 900,
              median_ttft: 0.5,
              p75_ttft: 1.2,
              p90_ttft: 3.1,
            },
          }),
          Sequence.AgenticTraces,
          percentile,
        );
      expect(agentic(Percentile.P90).ttft).toBe(3.1);
      expect(agentic(Percentile.P75).ttft).toBe(1.2);
    });

    it('is absent, not zero, when the row reported no first-token time', () => {
      expect(only(makeRow()).ttft).toBeUndefined();
      expect('ttft' in only(makeRow())).toBe(false);
    });
  });

  describe('cached-input fraction', () => {
    const withMetrics = (extra: Record<string, number>) =>
      makeRow({
        metrics: {
          median_intvty: 50,
          tput_per_gpu: 900,
          output_tput_per_gpu: 300,
          input_tput_per_gpu: 600,
          ...extra,
        },
      });
    const only = (row: BenchmarkRow) => {
      const { grouped } = buildGpuGroups([row], {
        ...shared,
        classify: singlePrecisionClassify,
      });
      return Object.values(grouped)[0][0];
    };

    it('is absent when the row records no cache metric — every fixed-sequence row', () => {
      expect(only(makeRow()).cacheHitRate).toBeUndefined();
    });

    it('sums the GPU and external hit rates', () => {
      expect(
        only(withMetrics({ server_gpu_cache_hit_rate: 0.66, server_external_cache_hit_rate: 0.25 }))
          .cacheHitRate,
      ).toBeCloseTo(0.91, 10);
    });

    it('ignores the CPU tier when an external rate is reported — external already counts it', () => {
      expect(
        only(
          withMetrics({
            server_gpu_cache_hit_rate: 0.819,
            server_external_cache_hit_rate: 0.06,
            server_cpu_cache_hit_rate: 0.067,
          }),
        ).cacheHitRate,
      ).toBeCloseTo(0.879, 10);
    });

    it('adds the CPU tier when no external rate is reported', () => {
      expect(
        only(withMetrics({ server_gpu_cache_hit_rate: 0.771, server_cpu_cache_hit_rate: 0.055 }))
          .cacheHitRate,
      ).toBeCloseTo(0.826, 10);
    });

    it('reads the CPU tier alone, and an external rate of zero still suppresses it', () => {
      expect(only(withMetrics({ server_cpu_cache_hit_rate: 0.5 })).cacheHitRate).toBeCloseTo(
        0.5,
        10,
      );
      expect(
        only(withMetrics({ server_external_cache_hit_rate: 0, server_cpu_cache_hit_rate: 0.5 }))
          .cacheHitRate,
      ).toBe(0);
    });

    it('reads either metric alone', () => {
      expect(only(withMetrics({ server_gpu_cache_hit_rate: 0.4 })).cacheHitRate).toBeCloseTo(
        0.4,
        10,
      );
      expect(only(withMetrics({ server_external_cache_hit_rate: 0.3 })).cacheHitRate).toBeCloseTo(
        0.3,
        10,
      );
    });

    it('clamps into [0,1] — real rows report a GPU rate as high as 1.185', () => {
      expect(only(withMetrics({ server_gpu_cache_hit_rate: 1.185 })).cacheHitRate).toBe(1);
      expect(only(withMetrics({ server_gpu_cache_hit_rate: -0.2 })).cacheHitRate).toBe(0);
    });
  });

  describe('input token share', () => {
    const only = (row: BenchmarkRow) => {
      const { grouped } = buildGpuGroups([row], { ...shared, classify: singlePrecisionClassify });
      return Object.values(grouped)[0][0];
    };

    it('takes the share from the rates when they agree with the total', () => {
      const point = only(
        makeRow({
          metrics: {
            median_intvty: 50,
            tput_per_gpu: 1000,
            input_tput_per_gpu: 700,
            output_tput_per_gpu: 300,
          },
        }),
      );
      expect(point.inputTokenShare).toBeCloseTo(0.7, 9);
    });

    it('falls back to ISL:OSL when the rates are on a different denominator', () => {
      const point = only(
        makeRow({
          disagg: true,
          isl: 1024,
          osl: 1024,
          metrics: {
            median_intvty: 50,
            tput_per_gpu: 300,
            input_tput_per_gpu: 400,
            output_tput_per_gpu: 100,
          },
        }),
      );
      expect(point.inputTokenShare).toBeCloseTo(0.5, 9);
      expect(point.inputTokenShare).not.toBeCloseTo(0.8, 2);
    });

    it('falls back to the run token counts when there is no fixed sequence', () => {
      const { grouped } = buildGpuGroups(
        [
          makeRow({
            disagg: true,
            benchmark_type: 'agentic_traces',
            isl: null,
            osl: null,
            metrics: {
              p90_itl: 1 / 50,
              tput_per_gpu: 300,
              input_tput_per_gpu: 400,
              output_tput_per_gpu: 100,
              total_prompt_tokens: 9000,
              total_generation_tokens: 1000,
            },
          }),
        ],
        {
          sequence: Sequence.AgenticTraces,
          precisions: ['fp4'],
          classify: singlePrecisionClassify,
        },
      );
      expect(Object.values(grouped)[0][0].inputTokenShare).toBeCloseTo(0.9, 9);
    });

    it('leaves the share unknown when disaggregated rates have no trustworthy mix', () => {
      const { grouped } = buildGpuGroups(
        [
          makeRow({
            disagg: true,
            benchmark_type: 'agentic_traces',
            isl: null,
            osl: null,
            metrics: {
              p90_itl: 1 / 50,
              tput_per_gpu: 300,
              input_tput_per_gpu: 400,
              output_tput_per_gpu: 100,
            },
          }),
        ],
        {
          sequence: Sequence.AgenticTraces,
          precisions: ['fp4'],
          classify: singlePrecisionClassify,
        },
      );

      expect(Object.values(grouped)[0][0].inputTokenShare).toBeUndefined();
    });

    it.each([true, false])(
      'preserves the agentic P/D token mix through the calculator projection (totals=%s)',
      (hasTotals) => {
        const row = makeRow({
          disagg: true,
          is_multinode: true,
          prefill_tp: 4,
          prefill_ep: 1,
          decode_tp: 16,
          decode_ep: 1,
          num_prefill_gpu: 4,
          num_decode_gpu: 16,
          benchmark_type: 'agentic_traces',
          isl: null,
          osl: null,
          metrics: {
            p90_itl: 1 / 50,
            tput_per_gpu: 300,
            input_tput_per_gpu: 750,
            output_tput_per_gpu: 187.5,
            ...(hasTotals ? { total_prompt_tokens: 1000, total_generation_tokens: 1000 } : {}),
          },
        });
        const options = {
          sequence: Sequence.AgenticTraces,
          precisions: ['fp4'],
          classify: singlePrecisionClassify,
        };
        const raw = Object.values(buildGpuGroups([row], options).grouped)[0][0];
        const compact = Object.values(
          buildGpuGroups(toCalculatorBenchmarkRows([row], 'agentic-traces'), options).grouped,
        )[0][0];
        expect(compact.inputTokenShare).toBe(raw.inputTokenShare);
        if (hasTotals) expect(compact.inputTokenShare).toBeCloseTo(0.5, 9);
        else expect(compact.inputTokenShare).toBeUndefined();
      },
    );
  });

  it('applies Internal TPUv7 owner cost to every calculator token basis', () => {
    const row = makeRow({
      hardware: 'tpuv7',
      framework: 'vllm',
      precision: 'fp8',
      metrics: {
        median_intvty: 50,
        tput_per_gpu: 900,
        output_tput_per_gpu: 300,
        input_tput_per_gpu: 600,
      },
    });
    const options = {
      sequence: Sequence.OneK_OneK,
      precisions: ['fp8'],
      classify: singlePrecisionClassify,
    };
    const external = Object.values(
      buildGpuGroups([row], { ...options, tcoBasis: 'external' }).grouped,
    )[0][0];
    const internal = Object.values(
      buildGpuGroups([row], { ...options, tcoBasis: 'internal' }).grouped,
    )[0][0];

    expect(internal.costh).toBeCloseTo((1.03 / 1.21) * external.costh);
    expect(internal.costhi).toBeCloseTo((1.03 / 1.21) * external.costhi);
    expect(internal.costhOutput).toBeCloseTo((1.03 / 1.21) * external.costhOutput);
    expect(internal.tpPerMw).toBe(external.tpPerMw);
  });

  it('drops rows whose isl/osl do not match the selected sequence', () => {
    const { grouped } = buildGpuGroups(
      [makeRow({ isl: 8192, osl: 1024 }), makeRow({ isl: null, osl: null })],
      { ...shared, classify: singlePrecisionClassify },
    );
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('drops rows whose precision is not selected', () => {
    const { grouped } = buildGpuGroups([makeRow({ precision: 'fp8' })], {
      ...shared,
      classify: singlePrecisionClassify,
    });
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('drops rows the caller classifies as null', () => {
    const { grouped } = buildGpuGroups([makeRow()], {
      ...shared,
      classify: () => null,
    });
    expect(Object.keys(grouped)).toHaveLength(0);
  });

  it('splits into one group per precision when multiple precisions are selected', () => {
    const { grouped, groupMeta } = buildGpuGroups(
      [makeRow({ precision: 'fp4' }), makeRow({ precision: 'fp8' })],
      {
        sequence: Sequence.OneK_OneK,
        precisions: ['fp4', 'fp8'],
        classify: (hwKey, row) => ({
          key: `${hwKey}__${row.precision}`,
          meta: { hwKey, precision: row.precision },
        }),
      },
    );

    const keys = Object.keys(grouped).toSorted();
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.includes('__fp4') || k.includes('__fp8'))).toBe(true);
    for (const key of keys) {
      expect(groupMeta[key].precision).toBe(key.endsWith('fp4') ? 'fp4' : 'fp8');
    }
  });

  it('keys overlay rows per run so two runs never share a group', () => {
    const runA = 'https://github.com/org/repo/actions/runs/111';
    const runB = 'https://github.com/org/repo/actions/runs/222';
    const runIndexByUrl = { [runA]: 0, [runB]: 1 };

    const { grouped, groupMeta } = buildGpuGroups(
      [makeRow({ run_url: runA }), makeRow({ run_url: runB, conc: 16 })],
      {
        ...shared,
        classify: (hwKey, row) => {
          const runIndex = overlayRunIndex(row.run_url, runIndexByUrl);
          return { key: `${hwKey}__run${runIndex}`, meta: { hwKey, runIndex } };
        },
      },
    );

    const keys = Object.keys(grouped).toSorted();
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => groupMeta[k].runIndex).toSorted()).toEqual([0, 1]);
    expect(grouped[keys[0]]).toHaveLength(1);
    expect(grouped[keys[1]]).toHaveLength(1);
  });

  it('shares the same hwKey between an official row and its overlay twin', () => {
    const official = buildGpuGroups([makeRow()], {
      ...shared,
      classify: singlePrecisionClassify,
    });
    const overlay = buildGpuGroups(
      [makeRow({ run_url: 'https://github.com/org/repo/actions/runs/111' })],
      {
        ...shared,
        classify: (hwKey) => ({ key: `${hwKey}__run0`, meta: { hwKey, runIndex: 0 } }),
      },
    );

    const officialHw = Object.values(official.groupMeta)[0].hwKey;
    const overlayHw = Object.values(overlay.groupMeta)[0].hwKey;
    expect(overlayHw).toBe(officialHw);
  });

  it('calculates agentic groups from null-ISL/OSL rows at the selected percentile', () => {
    const agenticMetrics = {
      p75_itl: 0.02,
      p75_ttlt: 12,
      p90_itl: 0.05,
      p90_ttlt: 20,
      p75_intvty: 999,
      p90_intvty: 999,
      tput_per_gpu: 900,
      output_tput_per_gpu: 300,
      input_tput_per_gpu: 600,
    };
    const rows = [
      makeRow({
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        metrics: agenticMetrics,
      }),
    ];

    const p90 = buildGpuGroups(rows, {
      sequence: Sequence.AgenticTraces,
      precisions: ['fp4'],
      percentile: Percentile.P90,
      classify: singlePrecisionClassify,
    });
    const p75 = buildGpuGroups(rows, {
      sequence: Sequence.AgenticTraces,
      precisions: ['fp4'],
      percentile: Percentile.P75,
      classify: singlePrecisionClassify,
    });

    expect(Object.values(p90.grouped)[0][0]).toMatchObject({
      interactivity: 20,
      e2eLatency: 20,
    });
    expect(Object.values(p75.grouped)[0][0]).toMatchObject({
      interactivity: 50,
      e2eLatency: 12,
    });
  });

  it('keeps an e2e-dominated agentic point, because grouping no longer gates on the e2e frontier', () => {
    const agenticRow = (
      conc: number,
      interactivity: number,
      e2eLatency: number,
      throughput: number,
      date = '2026-07-19',
    ) =>
      makeRow({
        id: conc,
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        conc,
        date,
        metrics: {
          p90_itl: 1 / interactivity,
          p90_ttlt: e2eLatency,
          tput_per_gpu: throughput,
          output_tput_per_gpu: throughput * 0.3,
          input_tput_per_gpu: throughput * 0.7,
        },
      });

    const { grouped } = buildGpuGroups(
      [
        agenticRow(1, 100, 20, 900),
        agenticRow(2, 80, 30, 800),
        agenticRow(4, 60, 40, 1200),
        agenticRow(8, 40, 50, 700, '2026-07-20'),
      ],
      {
        sequence: Sequence.AgenticTraces,
        precisions: ['fp4'],
        percentile: Percentile.P90,
        classify: singlePrecisionClassify,
      },
    );

    const points = Object.values(grouped)[0];
    expect(points.map((point) => point.concurrency).toSorted()).toEqual([1, 2, 4, 8]);
  });

  it('keeps agentic overlay frontiers isolated per unofficial run', () => {
    const runA = 'https://github.com/org/repo/actions/runs/111';
    const runB = 'https://github.com/org/repo/actions/runs/222';
    const rows = [
      makeRow({
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        run_url: runA,
        metrics: { p90_itl: 0.02, p90_ttlt: 50, tput_per_gpu: 500 },
      }),
      makeRow({
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        run_url: runB,
        metrics: { p90_itl: 0.01, p90_ttlt: 20, tput_per_gpu: 1000 },
      }),
    ];

    const { grouped } = buildGpuGroups(rows, {
      sequence: Sequence.AgenticTraces,
      precisions: ['fp4'],
      percentile: Percentile.P90,
      classify: (hwKey, row) => {
        const runIndex = overlayRunIndex(row.run_url, { [runA]: 0, [runB]: 1 });
        return { key: `${hwKey}__run${runIndex}`, meta: { hwKey, runIndex } };
      },
    });

    expect(Object.keys(grouped)).toHaveLength(2);
    expect(Object.values(grouped).map((points) => points.length)).toEqual([1, 1]);
  });
});

describe('interpolateForGPU clamped flag', () => {
  const points = [
    makePoint({ interactivity: 20, throughput: 900 }),
    makePoint({ interactivity: 50, throughput: 600 }),
    makePoint({ interactivity: 80, throughput: 300 }),
  ];

  it('is falsy for a target inside the measured range', () => {
    const result = interpolateForGPU(points, 50, 'interactivity_to_throughput', 'costh');
    expect(result?.clamped).toBeFalsy();
  });

  it('is set for a target above every measured point', () => {
    const result = interpolateForGPU(points, 200, 'interactivity_to_throughput', 'costh');
    expect(result?.value).toBeGreaterThan(0);
    expect(result?.clamped).toBe(true);
  });

  it('is set for a target below every measured point', () => {
    const result = interpolateForGPU(points, 1, 'interactivity_to_throughput', 'costh');
    expect(result?.clamped).toBe(true);
  });

  it('is set on the single-point path when the target misses that point', () => {
    const single = [makePoint({ interactivity: 40, throughput: 700 })];
    expect(
      interpolateForGPU(single, 40, 'interactivity_to_throughput', 'costh')?.clamped,
    ).toBeFalsy();
    expect(interpolateForGPU(single, 90, 'interactivity_to_throughput', 'costh')?.clamped).toBe(
      true,
    );
  });
});

describe('recoverReciprocalNumerator', () => {
  it('recovers the constant when every point agrees', () => {
    expect(recoverReciprocalNumerator([1, 2, 4], [400, 200, 100])).toBe(400);
  });

  it('tolerates float rounding, which is all production data shows', () => {
    const k = 516.6666666666666;
    const tputs = [1234.5, 987.65, 321.098];
    const values = tputs.map((t) => k / t);
    expect(recoverReciprocalNumerator(values, tputs)).toBeCloseTo(k, 9);
  });

  it('returns null when the points disagree — the numerator is not constant', () => {
    expect(recoverReciprocalNumerator([1, 2], [400, 300])).toBeNull();
  });

  it('accepts costs rounded for publication but rejects a percent-level drift', () => {
    expect(
      recoverReciprocalNumerator([0.0964, 0.2892, 0.6427, 1.928], [6000, 2000, 900, 300]),
    ).not.toBeNull();
    expect(recoverReciprocalNumerator([1, 2.02], [400, 200])).toBeNull();
  });

  it('skips unusable pairs rather than treating them as disagreement', () => {
    expect(recoverReciprocalNumerator([0, 1, 2], [400, 400, 200])).toBe(400);
    expect(recoverReciprocalNumerator([1, 2], [0, 200])).toBe(400);
  });

  it('returns null when no pair is usable', () => {
    expect(recoverReciprocalNumerator([0, 0], [100, 200])).toBeNull();
    expect(recoverReciprocalNumerator([], [])).toBeNull();
  });
});

describe('interpolateForGPU cost derivation', () => {
  const RATE = 578.4;
  const consistent = (interactivity: number, throughput: number) =>
    makePoint({
      interactivity,
      throughput,
      outputThroughput: throughput,
      inputThroughput: throughput,
      costh: RATE / throughput,
      costhOutput: RATE / throughput,
      costhi: RATE / throughput,
    });

  const frontier = [
    consistent(10, 6000),
    consistent(30, 2000),
    consistent(55, 900),
    consistent(80, 300),
  ];

  it('keeps cost x throughput equal to the provider rate between measured points', () => {
    for (const target of [15, 20, 42, 60, 75]) {
      const r = interpolateForGPU(frontier, target, 'interactivity_to_throughput', 'costh')!;
      expect(r.cost * r.value).toBeCloseTo(RATE, 6);
      expect(r.costOutput * r.outputTputValue).toBeCloseTo(RATE, 6);
      expect(r.costInput * r.inputTputValue).toBeCloseTo(RATE, 6);
    }
  });

  it('matches the Python blog helper', () => {
    const target = 42;
    const typescriptValue = interpolateForGPU(
      frontier,
      target,
      'interactivity_to_throughput',
      'costh',
    )!.cost;
    const pythonValue = interpolateWithPython({
      points: frontier.map((point) => ({
        interactivity: point.interactivity,
        throughput: point.throughput,
        cost: point.costh,
      })),
      target_iv: target,
      metric_key: 'cost',
      reciprocal_of: 'throughput',
    });

    expect(pythonValue).toBeCloseTo(typescriptValue, 14);
  });

  it('keeps the Python helper in sync for cache-aware revenue interpolation', () => {
    const pythonValue = interpolateWithPython({
      points: [
        {
          interactivity: 20,
          throughput: 800,
          input_tput_per_gpu: 640,
          output_tput_per_gpu: 160,
          server_gpu_cache_hit_rate: 0.8,
          revenue: 1.22112,
        },
        {
          interactivity: 40,
          throughput: 600,
          input_tput_per_gpu: 480,
          output_tput_per_gpu: 120,
          server_gpu_cache_hit_rate: 0.9,
          revenue: 0.76032,
        },
      ],
      target_iv: 30,
      metric_key: 'revenue',
      proportional_to: 'throughput',
      revenue_pricing: {
        input_per_million: 1,
        cached_input_per_million: 0.1,
        output_per_million: 1,
      },
    });

    expect(pythonValue).toBeCloseTo(0.935015625, 14);
  });

  it('keeps the Python helper in sync for infrastructure total tokens per dollar', () => {
    const interactivities = [20, 40];
    const throughputs = [800, 600];
    const interpolatedThroughput = hermiteInterpolate(
      interactivities,
      throughputs,
      monotoneSlopes(interactivities, throughputs),
      30,
    );
    const pythonValue = interpolateWithPython({
      points: [
        {
          interactivity: 20,
          throughput: 800,
          tokens_per_dollar: 2_000_000,
        },
        {
          interactivity: 40,
          throughput: 600,
          tokens_per_dollar: 1_500_000,
        },
      ],
      target_iv: 30,
      metric_key: 'tokens_per_dollar',
      proportional_to: 'throughput',
    });

    expect(pythonValue).toBeCloseTo(interpolatedThroughput * 2_500, 8);
  });

  it('makes the Python helper return null when reciprocal throughput is missing', () => {
    const pythonValue = interpolateWithPython({
      points: [
        { interactivity: 10, throughput: 1000, output_throughput: 800, joules: 2 },
        { interactivity: 30, throughput: 500, joules: 4 },
      ],
      target_iv: 20,
      metric_key: 'joules',
      reciprocal_of: 'output_throughput',
    });

    expect(pythonValue).toBeNull();
  });

  it('is exact at a measured point, where both methods agree anyway', () => {
    const r = interpolateForGPU(frontier, 30, 'interactivity_to_throughput', 'costh')!;
    expect(r.value).toBeCloseTo(2000, 6);
    expect(r.cost).toBeCloseTo(RATE / 2000, 9);
  });

  it('reads below the old splined value on a two-knot bracket, near (1+r)^2/(4r)', () => {
    const t1 = 6000;
    const t2 = 300;
    const xs = [10, 80];
    const pair = [consistent(xs[0]!, t1), consistent(xs[1]!, t2)];
    const mid = (xs[0]! + xs[1]!) / 2;

    const derived = interpolateForGPU(pair, mid, 'interactivity_to_throughput', 'costh')!.cost;
    const costs = [RATE / t1, RATE / t2];
    const splined = hermiteInterpolate(xs, costs, monotoneSlopes(xs, costs), mid);

    expect(derived).toBeLessThan(splined);
    const r = t1 / t2;
    expect(splined / derived).toBeCloseTo((1 + r) ** 2 / (4 * r), 0);
    const at = interpolateForGPU(pair, mid, 'interactivity_to_throughput', 'costh')!;
    expect(at.cost * at.value).toBeCloseTo(RATE, 6);
  });

  it('falls back to splining when the points do not obey the identity', () => {
    const inconsistent = [
      makePoint({ interactivity: 10, throughput: 1000, costh: 0.2 }),
      makePoint({ interactivity: 40, throughput: 200, costh: 2 }),
    ];
    const r = interpolateForGPU(inconsistent, 25, 'interactivity_to_throughput', 'costh')!;
    expect(r.cost).toBeGreaterThan(0.2);
    expect(r.cost).toBeLessThan(2);
    expect(r.cost * r.value).not.toBeCloseTo(200, 3);
  });

  it('derives cost from the target axis in throughput_to_interactivity mode', () => {
    const r = interpolateForGPU(frontier, 1500, 'throughput_to_interactivity', 'costh')!;
    expect(r.cost).toBeCloseTo(RATE / 1500, 9);
  });

  it('agrees with maxInteractivityAtCost on the derived curve', () => {
    const budget = 0.45;
    const iv = maxInteractivityAtCost(frontier, budget, 'costh', 'total')!;
    expect(iv).not.toBeNull();
    const at = interpolateForGPU(frontier, iv, 'interactivity_to_throughput', 'costh')!;
    expect(at.cost).toBeLessThanOrEqual(budget + 1e-6);
    const above = interpolateForGPU(frontier, iv + 1, 'interactivity_to_throughput', 'costh')!;
    expect(above.cost).toBeGreaterThan(budget);
  });
});
