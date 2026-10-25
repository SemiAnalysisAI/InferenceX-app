import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import type { InferenceData } from '../types';
import {
  breakdownItWattsPerGpu,
  breakdownSeriesAtBoundary,
  buildPowerBreakdowns,
  compareBreakdownsAt,
  defaultComparisonInteractivity,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
  POWER_BREAKDOWN_STACK_ORDER,
  powerBreakdownInteractivity,
  powerBreakdownPointLabels,
  stackPowerBreakdown,
} from './power-breakdown';

const metric = (y: number) => ({ y, roof: false });

function row(gpuWatts: number, overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    model: 'qwen3.5',
    hardware: 'b200',
    framework: 'sglang',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 1,
    offload_mode: 'off',
    image: 'lmsysorg/sglang:v0.5.19-cu130',
    date: '2026-09-08',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    metrics: {
      power_valid: 1,
      power_metric_schema_version: 2,
      avg_power_w: gpuWatts,
      avg_total_gpu_power_w: gpuWatts * 8,
      median_intvty: 100,
    },
    ...overrides,
  } as BenchmarkRow;
}

let nextId = 1;
function point(
  gpuWatts: number,
  overrides: Partial<InferenceData> = {},
  rowOverrides: Partial<BenchmarkRow> = {},
): InferenceData {
  const modeledSystemPower = modelSystemPower(row(gpuWatts, rowOverrides));
  return {
    id: nextId++,
    x: 100,
    y: gpuWatts,
    median_intvty: 100,
    hwKey: 'b200_sglang',
    date: '2026-09-08',
    tp: 8,
    physicalChips: 8,
    precision: 'fp8',
    conc: 1,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1',
    model: 'Qwen-3.5-397B-A17B',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 8,
    output_tput_per_gpu: 50,
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    measuredAvgPower: metric(gpuWatts),
    utilityModeledWatts: metric(1),
    modeledSystemPower,
    ...overrides,
  };
}

describe('buildPowerBreakdowns', () => {
  it('splits each point into parts that sum to All in Measured W/GPU', () => {
    const [series] = buildPowerBreakdowns([point(600, { conc: 64 }), point(250, { conc: 1 })]);
    expect(series.label).toContain('B200');
    expect(series.points.map((entry) => entry.concurrency)).toEqual([1, 64]);
    for (const entry of series.points) {
      const sum = Object.values(entry.wattsPerGpu).reduce((total, watts) => total + watts, 0);
      expect(sum).toBeCloseTo(entry.totalWattsPerGpu, 9);
      expect(entry.wattsPerGpu.gpu).toBeCloseTo(entry.point.measuredAvgPower!.y, 9);
      expect(entry.wattsPerGpu.facility).toBeGreaterThan(0);
    }
    // Measured parts sit at the bottom; categories with no watts are left out.
    expect(series.categories[0]).toBe('gpu');
    expect(series.categories).not.toContain('measuredCpu');
    expect(series.categories).toEqual(
      POWER_BREAKDOWN_STACK_ORDER.filter((key) => series.categories.includes(key)),
    );
    expect(series.tdpWattsPerGpu).toBeGreaterThan(0);
    expect(series.allInProvisionedWattsPerGpu).toBeGreaterThan(series.points[1].totalWattsPerGpu);
  });

  it('groups by hardware and precision and drops points without a supported estimate', () => {
    const series = buildPowerBreakdowns([
      point(300),
      point(300, { precision: 'fp4' }, { precision: 'fp4' }),
      point(300, { conc: 8, modeledSystemPower: undefined }),
      point(300, { conc: 16 }, { metrics: { median_intvty: 100 } }),
    ]);
    expect(series.map((entry) => entry.key).toSorted()).toEqual([
      'b200_sglang|fp4',
      'b200_sglang|fp8',
    ]);
    expect(series.every((entry) => entry.points.length === 1)).toBe(true);
  });
});

describe('powerBreakdownInteractivity', () => {
  it('places points on the chart interactivity axis, ordered by it, and drops points without one', () => {
    const interactivity = powerBreakdownInteractivity('p90_intvty');
    expect(interactivity).toMatchObject({ field: 'p90_intvty', fromChart: true });
    const [series] = buildPowerBreakdowns(
      [
        point(600, { conc: 64, p90_intvty: 20 }),
        point(250, { conc: 1, p90_intvty: 140 }),
        point(400, { conc: 8, p90_intvty: 70 }),
        point(450, { conc: 16 }),
      ],
      'en',
      interactivity,
    );
    expect(series.points.map((entry) => [entry.concurrency, entry.interactivity])).toEqual([
      [64, 20],
      [8, 70],
      [1, 140],
    ]);
  });

  it('reads trace-derived AgentX axes from point.x and falls back to median on latency charts', () => {
    const derived = powerBreakdownInteractivity('p90_e2e_norm_intvty');
    expect(derived.fromChart).toBe(true);
    expect(derived.value(point(300, { x: 31.5 }))).toBe(31.5);
    const latency = powerBreakdownInteractivity('median_e2el');
    expect(latency).toMatchObject({ field: 'median_intvty', fromChart: false });
    expect(latency.value(point(300, { x: 9, median_intvty: 42 }))).toBe(42);
  });
});

describe('powerBreakdownPointLabels', () => {
  it('numbers repeated concurrencies so every bar keeps a distinct tick', () => {
    const [series] = buildPowerBreakdowns([
      point(250, { conc: 1, median_intvty: 120 }),
      point(400, { conc: 16, date: '2026-09-01', median_intvty: 40 }),
      point(420, { conc: 16, date: '2026-09-08', median_intvty: 38 }),
    ]);
    expect(powerBreakdownPointLabels(series.points)).toEqual(['c16 · 1', 'c16 · 2', 'c1']);
  });
});

describe('stackPowerBreakdown', () => {
  it('stacks contiguous segments ending at the total', () => {
    const [series] = buildPowerBreakdowns([point(500)]);
    const segments = stackPowerBreakdown(series.points[0], series.categories);
    expect(segments[0].y0).toBe(0);
    for (let index = 1; index < segments.length; index++) {
      expect(segments[index].y0).toBe(segments[index - 1].y1);
    }
    expect(segments.at(-1)!.y1).toBeCloseTo(series.points[0].totalWattsPerGpu, 9);
  });
});

describe('breakdownSeriesAtBoundary', () => {
  it('counts IT only by dropping the facility part from categories and totals', () => {
    const [series] = buildPowerBreakdowns([point(500)]);
    const entry = series.points[0];
    expect(series.categories).toContain('facility');
    expect(entry.wattsPerGpu.facility).toBeGreaterThan(0);
    const itSeries = breakdownSeriesAtBoundary(series, false);
    expect(itSeries.categories).not.toContain('facility');
    expect(itSeries.categories).toEqual(series.categories.filter((key) => key !== 'facility'));
    expect(itSeries.points[0].wattsPerGpu.facility).toBe(0);
    expect(itSeries.points[0].totalWattsPerGpu).toBeCloseTo(
      entry.totalWattsPerGpu - entry.wattsPerGpu.facility,
      9,
    );
    expect(itSeries.points[0].totalWattsPerGpu).toBeCloseTo(breakdownItWattsPerGpu(entry), 9);
    // The IT stack still sums to its total exactly.
    const segments = stackPowerBreakdown(itSeries.points[0], itSeries.categories);
    expect(segments.at(-1)!.y1).toBeCloseTo(itSeries.points[0].totalWattsPerGpu, 9);
    // Facility × PUE identity: IT × PUE = facility total.
    expect(itSeries.points[0].totalWattsPerGpu * entry.pue).toBeCloseTo(entry.totalWattsPerGpu, 6);
    // Including the facility returns the series untouched.
    expect(breakdownSeriesAtBoundary(series, true)).toBe(series);
  });
});

function fakeSeries(label: string, points: [interactivity: number, total: number][]) {
  return {
    key: label,
    hwKey: label,
    precision: 'fp8',
    label,
    categories: ['gpu'],
    tdpWattsPerGpu: null,
    allInProvisionedWattsPerGpu: null,
    points: points.map(
      ([interactivity, total]) =>
        ({ interactivity, totalWattsPerGpu: total }) as unknown as PowerBreakdownPoint,
    ),
  } as PowerBreakdownSeries;
}

describe('cross-chip comparison', () => {
  const a = fakeSeries('A', [
    [10, 1500],
    [40, 1200],
    [160, 900],
  ]);
  const b = fakeSeries('B', [
    [20, 1300],
    [80, 1000],
  ]);

  it('defaults to the geometric middle of the range every chip covers', () => {
    expect(defaultComparisonInteractivity([a, b])).toBeCloseTo(40, 9);
    expect(defaultComparisonInteractivity([])).toBeNull();
  });

  it('falls back to the full range when chips do not overlap', () => {
    const low = fakeSeries('L', [
      [5, 1],
      [10, 1],
    ]);
    const high = fakeSeries('H', [
      [100, 1],
      [200, 1],
    ]);
    expect(defaultComparisonInteractivity([low, high])).toBeCloseTo(Math.sqrt(5 * 200), 9);
  });

  it("picks each chip's nearest point on a log scale and sorts by total", () => {
    const { rows, outOfRange } = compareBreakdownsAt([a, b], 56);
    expect(outOfRange).toEqual([]);
    expect(rows.map((r) => [r.series.label, r.entry.interactivity])).toEqual([
      ['B', 80],
      ['A', 40],
    ]);
  });

  it('leaves out chips with no point near the target', () => {
    const { rows, outOfRange } = compareBreakdownsAt([a, b], 160);
    expect(rows.map((r) => r.series.label)).toEqual(['A']);
    expect(outOfRange.map((s) => s.label)).toEqual(['B']);
    expect(compareBreakdownsAt([a], 0).outOfRange).toHaveLength(1);
  });
});
