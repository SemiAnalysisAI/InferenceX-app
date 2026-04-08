import { describe, it, expect } from 'vitest';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';

// Test the pure logic used by InferenceTable — sorting and value resolution
import { getNestedYValue } from '@/lib/chart-utils';

const CHART_DEF = {
  chartType: 'interactivity',
  heading: 'vs. Interactivity',
  x: 'median_intvty',
  x_label: 'Interactivity (tok/s/user)',
  y: 'tput_per_gpu',
  y_tpPerGpu: 'tpPerGpu.y',
  y_tpPerGpu_label: 'Token Throughput per GPU (tok/s/gpu)',
  y_tpPerGpu_title: 'Token Throughput per GPU',
  y_tpPerGpu_roofline: 'upper_left',
  y_costh: 'costh.y',
  y_costh_label: 'Cost per Million Total Tokens ($)',
  y_costh_roofline: 'lower_right',
} as unknown as ChartDefinition;

function makePoint(overrides: Partial<InferenceData>): InferenceData {
  return {
    x: 10,
    y: 100,
    hwKey: 'b200_sglang',
    date: '2026-04-07',
    tp: 8,
    conc: 16,
    precision: 'fp8',
    tpPerGpu: { y: 500, roof: false },
    tpPerMw: { y: 200, roof: false },
    costh: { y: 0.5, roof: false },
    costn: { y: 0.4, roof: false },
    costr: { y: 0.3, roof: false },
    costhi: { y: 0.2, roof: false },
    costni: { y: 0.15, roof: false },
    costri: { y: 0.1, roof: false },
    ...overrides,
  } as InferenceData;
}

describe('InferenceTable sorting logic', () => {
  it('sorts by Y value descending for upper_left roofline (throughput)', () => {
    const points = [
      makePoint({ tpPerGpu: { y: 100, roof: false } }),
      makePoint({ tpPerGpu: { y: 500, roof: true } }),
      makePoint({ tpPerGpu: { y: 300, roof: false } }),
    ];

    const yPath = CHART_DEF.y_tpPerGpu as string;
    const sorted = [...points].toSorted(
      (a, b) => getNestedYValue(b, yPath) - getNestedYValue(a, yPath),
    );

    expect(getNestedYValue(sorted[0], yPath)).toBe(500);
    expect(getNestedYValue(sorted[1], yPath)).toBe(300);
    expect(getNestedYValue(sorted[2], yPath)).toBe(100);
  });

  it('sorts by Y value ascending for lower_right roofline (cost)', () => {
    const points = [
      makePoint({ costh: { y: 0.8, roof: false } }),
      makePoint({ costh: { y: 0.2, roof: true } }),
      makePoint({ costh: { y: 0.5, roof: false } }),
    ];

    const yPath = CHART_DEF.y_costh as string;
    const sorted = [...points].toSorted(
      (a, b) => getNestedYValue(a, yPath) - getNestedYValue(b, yPath),
    );

    expect(getNestedYValue(sorted[0], yPath)).toBe(0.2);
    expect(getNestedYValue(sorted[1], yPath)).toBe(0.5);
    expect(getNestedYValue(sorted[2], yPath)).toBe(0.8);
  });
});

describe('getNestedYValue', () => {
  it('resolves nested roofline metric path (tpPerGpu.y)', () => {
    const point = makePoint({ tpPerGpu: { y: 42, roof: true } });
    expect(getNestedYValue(point, 'tpPerGpu.y')).toBe(42);
  });

  it('resolves nested cost metric path (costh.y)', () => {
    const point = makePoint({ costh: { y: 1.23, roof: false } });
    expect(getNestedYValue(point, 'costh.y')).toBe(1.23);
  });

  it('returns 0 for missing paths', () => {
    const point = makePoint({});
    expect(getNestedYValue(point, 'nonexistent.y')).toBe(0);
  });
});
