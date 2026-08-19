import { describe, it, expect } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { interpolateMetricAtInteractivity } from './useInterpolatedTrendData';

// ─── Factory ───

function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 64,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 1000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1.2, roof: false },
    costn: { y: 0.9, roof: false },
    costr: { y: 0.7, roof: false },
    costhi: { y: 0.5, roof: false },
    costni: { y: 0.4, roof: false },
    costri: { y: 0.3, roof: false },
    ...overrides,
  } as InferenceData;
}

// ─── Tests ───

describe('interpolateMetricAtInteractivity', () => {
  it('returns null for empty points', () => {
    expect(interpolateMetricAtInteractivity([], 100, 'tpPerGpu')).toBeNull();
  });

  it('returns null when target is below data range', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    expect(interpolateMetricAtInteractivity(points, 30, 'tpPerGpu')).toBeNull();
  });

  it('returns null when target is above data range', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    expect(interpolateMetricAtInteractivity(points, 150, 'tpPerGpu')).toBeNull();
  });

  it('interpolates throughput at a mid-range interactivity point', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
      makePoint({ x: 80, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 50, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(350);
    expect(result!).toBeLessThan(650);
  });

  it('returns exact value at a frontier knot point', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(600, 0);
  });

  it('clamps negative spline overshoots to zero', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 100, roof: false }, costh: { y: 0.1, roof: false } }),
      makePoint({ x: 20, tpPerGpu: { y: 50, roof: false }, costh: { y: 0.05, roof: false } }),
      makePoint({ x: 30, tpPerGpu: { y: 10, roof: false }, costh: { y: 0.01, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 25, 'costh');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(0);
  });

  it('interpolates tokens per dollar as a throughput-proportional metric', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        costh: { y: 800_000, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 600, roof: false },
        costh: { y: 600_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        costh: { y: 400_000, roof: false },
      }),
    ];
    const result = interpolateMetricAtInteractivity(points, 30, 'costh');
    expect(result).toBeCloseTo(700_000, 0);
  });

  it('uses the matching output-throughput Pareto knots for output tokens per dollar', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 1000, roof: false },
        outputTputPerGpu: { y: 100, roof: false },
        costhOutput: { y: 100_000, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 800, roof: false },
        outputTputPerGpu: { y: 700, roof: false },
        costhOutput: { y: 700_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 900, roof: false },
        outputTputPerGpu: { y: 500, roof: false },
        costhOutput: { y: 500_000, roof: false },
      }),
    ];

    // The total-throughput frontier drops x=40, while the output-throughput
    // frontier keeps x=40 and drops x=20. The midpoint must follow the latter.
    expect(interpolateMetricAtInteractivity(points, 50, 'costhOutput')).toBeCloseTo(581_250, 0);
  });

  it('uses the matching input-throughput Pareto knots for input tokens per dollar', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 1000, roof: false },
        inputTputPerGpu: { y: 100, roof: false },
        costhi: { y: 200_000, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 800, roof: false },
        inputTputPerGpu: { y: 700, roof: false },
        costhi: { y: 1_400_000, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 900, roof: false },
        inputTputPerGpu: { y: 500, roof: false },
        costhi: { y: 1_000_000, roof: false },
      }),
    ];

    expect(interpolateMetricAtInteractivity(points, 50, 'costhi')).toBeCloseTo(1_162_500, 0);
  });

  it('filters dominated points via Pareto front', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 30, tpPerGpu: { y: 300, roof: false } }), // dominated
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(400);
    expect(result!).toBeLessThan(800);
  });

  it('handles single point matching target exactly', () => {
    const points = [makePoint({ x: 50, tpPerGpu: { y: 1000, roof: false } })];
    const result = interpolateMetricAtInteractivity(points, 50, 'tpPerGpu');
    expect(result).toBe(1000);
  });

  it('returns null for single point not matching target', () => {
    const points = [makePoint({ x: 50, tpPerGpu: { y: 1000, roof: false } })];
    expect(interpolateMetricAtInteractivity(points, 60, 'tpPerGpu')).toBeNull();
  });

  it('works with tpPerMw metric', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false }, tpPerMw: { y: 100, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false }, tpPerMw: { y: 80, roof: false } }),
      makePoint({ x: 60, tpPerGpu: { y: 400, roof: false }, tpPerMw: { y: 60, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 30, 'tpPerMw');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(70);
    expect(result!).toBeLessThan(100);
  });

  it('works with energy metric (jTotal)', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        jTotal: { y: 2.5, roof: false },
      }),
      makePoint({
        x: 40,
        tpPerGpu: { y: 600, roof: false },
        jTotal: { y: 3, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        jTotal: { y: 4, roof: false },
      }),
    ];
    const result = interpolateMetricAtInteractivity(points, 30, 'jTotal');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(2);
    expect(result!).toBeLessThan(3.5);
  });

  it.each([
    'measuredJPerSuccessfulQuery',
    'measuredWhPerSuccessfulQuery',
    'measuredPowerPercentTdp',
  ] as const)('interpolates the derived measured metric %s', (metricKey) => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        [metricKey]: { y: 80, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        [metricKey]: { y: 40, roof: false },
      }),
    ];

    const result = interpolateMetricAtInteractivity(points, 40, metricKey);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(40);
    expect(result!).toBeLessThan(80);
  });

  it('returns null when metric field is missing from data points', () => {
    const points = [
      makePoint({ x: 20, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 40, tpPerGpu: { y: 600, roof: false } }),
    ];
    // jOutput is not set on these points. Returning 0 would render a flat
    // zero-line that looks like real data (the bug F4 fixed); return null
    // so the trend chart can show a gap instead.
    const result = interpolateMetricAtInteractivity(points, 30, 'jOutput');
    expect(result).toBeNull();
  });

  it('handles two frontier points at close x values', () => {
    const points = [
      makePoint({ x: 50, tpPerGpu: { y: 900, roof: false } }),
      makePoint({ x: 50.001, tpPerGpu: { y: 800, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 400, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 75, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(300);
    expect(result!).toBeLessThan(900);
  });

  it('works with outputTputPerGpu metric', () => {
    const points = [
      makePoint({
        x: 20,
        tpPerGpu: { y: 800, roof: false },
        outputTputPerGpu: { y: 700, roof: false },
      }),
      makePoint({
        x: 60,
        tpPerGpu: { y: 400, roof: false },
        outputTputPerGpu: { y: 350, roof: false },
      }),
    ];
    const result = interpolateMetricAtInteractivity(points, 40, 'outputTputPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(300);
    expect(result!).toBeLessThan(700);
  });

  it('returns exact boundary value at the lowest frontier x', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 1000, roof: false } }),
      makePoint({ x: 50, tpPerGpu: { y: 500, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 10, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(1000, 0);
  });

  it('returns exact boundary value at the highest frontier x', () => {
    const points = [
      makePoint({ x: 10, tpPerGpu: { y: 1000, roof: false } }),
      makePoint({ x: 50, tpPerGpu: { y: 500, roof: false } }),
      makePoint({ x: 100, tpPerGpu: { y: 200, roof: false } }),
    ];
    const result = interpolateMetricAtInteractivity(points, 100, 'tpPerGpu');
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(200, 0);
  });
});
