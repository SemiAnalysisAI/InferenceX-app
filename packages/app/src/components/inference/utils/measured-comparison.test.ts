import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import {
  comparisonOutputThroughput,
  comparisonSourceKey,
  comparisonSourceOptions,
  relativeComparisonSeries,
  comparisonSeries,
  comparisonValueAtX,
  measuredComparisonPanels,
  measuredComparisonRows,
  reconstructedRoleEnergy,
} from './measured-comparison';

function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey: 'h200',
    date: '2026-09-15',
    precision: 'fp8',
    tp: 8,
    conc: 1,
    x: 10,
    y: 4,
    median_intvty: 10,
    mean_intvty: 12,
    tpPerGpu: { y: 1, roof: false },
    tpPerMw: { y: 1, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    measuredAvgPower: { y: 250, roof: false },
    powerxGpuProvisionedWatts: { y: 700, roof: false },
    powerxUtilityProvisionedWatts: { y: 1370, roof: false },
    powerxUtilityModeledWatts: { y: 450, roof: false },
    ...overrides,
  };
}
describe('measured comparison charts', () => {
  it('renders four boundaries from the same real hardware without requiring measured coverage', () => {
    const panel = measuredComparisonPanels('boundaries', 'power')[0];
    const series = comparisonSeries(
      [
        { point: point() },
        { point: point({ conc: 2, median_intvty: 20, measuredAvgPower: undefined }) },
      ],
      panel,
      'median_intvty',
    );
    expect(series).toHaveLength(4);
    expect(series.every((item) => item.hwKey === 'h200')).toBe(true);
    expect(series.find((item) => item.metric.key === 'measuredAvgPower')!.points[1].y).toBeNaN();
    expect(
      series
        .find((item) => item.metric.key === 'powerxGpuProvisionedWatts')!
        .points.map((p) => p.y),
    ).toEqual([700, 700]);
  });
  it('never joins independent runs, dates, configurations or unofficial overlays', () => {
    const sources = [
      { point: point() },
      { point: point({ conc: 2, median_intvty: 20 }) },
      { point: point({ tp: 4 }) },
      { point: point({ date: '2026-09-14' }) },
      { point: point({ run_url: 'https://example.test/run/1' }) },
      { point: point(), overlayIndex: 0 },
    ];
    const series = comparisonSeries(
      sources,
      measuredComparisonPanels('boundaries', 'power')[0],
      'mean_intvty',
    );
    expect(series.filter((item) => item.metric.key === 'measuredAvgPower')).toHaveLength(5);
    expect(series.every((item) => item.points.every((p) => p.x === 12))).toBe(true);
  });
  it('reconstructs both roles using actual same-window energy denominators', () => {
    const p = {
      disagg: true,
      power_valid: 1,
      power_metric_schema_version: 2,
      joules_per_input_token: 1,
      joules_per_output_token: 7.9,
      prefill_joules_per_input_token: 0.25,
      decode_joules_per_output_token: 6,
      isl: 8192,
      osl: 1024,
    };
    expect(reconstructedRoleEnergy(p)).toEqual({
      prefill: 1.975,
      decode: 6,
      total: 7.975,
      prefillShare: (100 * 1.975) / 7.975,
    });
    for (const overrides of [
      { power_valid: 0 },
      { power_metric_schema_version: 1 },
      { joules_per_input_token: 0 },
      { decode_joules_per_output_token: undefined },
      { disagg: false },
    ]) {
      expect(reconstructedRoleEnergy({ ...p, ...overrides })).toBeUndefined();
    }
  });
  it('requires resolved trace-derived coordinates and never substitutes a latency coordinate', () => {
    const panel = measuredComparisonPanels('boundaries', 'power')[0];
    expect(comparisonSeries([{ point: point() }], panel, 'p75_e2e_norm_intvty')).toEqual([]);
    const resolved = { ...point(), p75_e2e_norm_intvty: 42 };
    expect(
      comparisonSeries([{ point: resolved }], panel, 'p75_e2e_norm_intvty').every(
        (series) => series.points[0].x === 42,
      ),
    ).toBe(true);
  });
  it('labels native role denominators separately and reconstructed panels with common units', () => {
    const roles = measuredComparisonPanels('roles', 'energy');
    expect(roles[1].metrics.map((m) => m.label)).toEqual([
      'Prefill · J/input token',
      'Decode · J/output token',
    ]);
    expect(measuredComparisonPanels('role-energy', 'energy').map((p) => p.unit)).toEqual([
      'W/GPU',
      '%',
      'J/output token',
    ]);
    const [, share, contributions] = measuredComparisonPanels('role-energy', 'energy');
    const p = point({
      disagg: true,
      power_valid: 1,
      power_metric_schema_version: 2,
      joules_per_input_token: 1,
      joules_per_output_token: 8,
      prefill_joules_per_input_token: 0.25,
      decode_joules_per_output_token: 6,
    });
    expect(contributions.metrics.map((metric) => metric.value(p))).toEqual([2, 6, 8]);
    expect(share.metrics[0].value(p)).toBe(25);
  });
  it('counts historical source rows once across measured panels, retaining overlay identity', () => {
    const legacy = point({
      id: 101,
      power_tier: 'legacy',
      measuredJPerOutputToken: { y: 4, roof: false },
    });
    const sources = [
      { point: legacy },
      { point: legacy, overlayIndex: 0 },
      { point: point({ id: 102, power_tier: 'legacy', measuredAvgPower: undefined }) },
    ];
    const curves = measuredComparisonPanels('boundaries', 'power').flatMap((panel) =>
      comparisonSeries(sources, panel, 'median_intvty'),
    );
    const rows = measuredComparisonRows(curves);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.power_tier === 'legacy' && row.id === 101)).toBe(true);
  });
  it('interpolates only adjacent covered points, with no extrapolation or bridging missing values', () => {
    const points = [
      { x: 10, y: 2 },
      { x: 20, y: 4 },
    ];
    expect(comparisonValueAtX(points, 15)).toBe(3);
    expect(comparisonValueAtX(points, 10)).toBe(2);
    expect(comparisonValueAtX(points, 9)).toBeUndefined();
    expect(comparisonValueAtX(points, 21)).toBeUndefined();
    expect(comparisonValueAtX([...points, { x: 20, y: 5 }], 15)).toBeUndefined();
    expect(
      comparisonValueAtX(
        [
          { x: 10, y: 2 },
          { x: 15, y: NaN },
          { x: 20, y: 4 },
        ],
        16,
      ),
    ).toBeUndefined();
  });
});

describe('all-GPU output throughput', () => {
  it('normalizes disaggregated fixed-sequence throughput across both GPU pools', () => {
    const p = {
      output_tput_per_gpu: 200,
      disagg: true,
      benchmark_type: 'single_turn',
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    };
    expect(comparisonOutputThroughput(p)).toBe(100);
    expect(comparisonOutputThroughput({ ...p, benchmark_type: 'agentic_traces' })).toBe(200);
    expect(comparisonOutputThroughput({ ...p, disagg: false })).toBe(200);
    expect(comparisonOutputThroughput({ ...p, num_prefill_gpu: undefined })).toBeUndefined();
    expect(comparisonOutputThroughput({ ...p, num_decode_gpu: 1.5 })).toBeUndefined();
  });
});

describe('relative hardware comparisons at equal service levels', () => {
  const source = (hwKey: string, x: number, power: number, throughput: number, energy: number) => ({
    point: point({
      hwKey,
      median_intvty: x,
      conc: x,
      output_tput_per_gpu: throughput,
      measuredAvgPower: { y: power, roof: false },
      measuredJPerOutputToken: { y: energy, roof: false },
    }),
  });
  const baseline = [source('h200', 10, 200, 100, 4), source('h200', 30, 400, 50, 8)];
  const comparator = [source('b200', 20, 330, 90, 3), source('b200', 40, 440, 60, 5)];
  const keyA = comparisonSourceKey(baseline[0]);
  const keyB = comparisonSourceKey(comparator[0]);

  it('interpolates each source first and reports explicit power/output gains and energy savings', () => {
    const curves = relativeComparisonSeries(
      [...baseline, ...comparator],
      'median_intvty',
      keyA,
      keyB,
      25,
    );
    expect(curves).toHaveLength(3);
    expect(curves[0].points.map((p) => p.x)).toEqual([20, 25, 30]);
    expect(curves[0].points[0].y).toBeCloseTo(10);
    expect(curves[1].points[0].y).toBeCloseTo(20);
    expect(curves[2].points[0].y).toBeCloseTo(50);
    expect(curves[0].points[1].relative).toEqual({ baseline: 350, comparator: 357.5 });
    expect(curves[0].points[1].y).toBeCloseTo((100 * 7.5) / 350);
    expect(curves[0].points[2].y).toBeCloseTo(-3.75);
    expect(
      relativeComparisonSeries(
        [...baseline, ...comparator],
        'median_intvty',
        keyA,
        keyB,
        100,
      )[0].points.map((p) => p.x),
    ).toEqual([20, 30]);
  });

  it('does not silently select a source, pool configurations or match nonoverlapping concurrency', () => {
    const otherRun = baseline.map((s) => ({
      point: { ...s.point, run_url: 'https://example.test/run/2' },
    }));
    const all = [...baseline, ...comparator, ...otherRun];
    expect(comparisonSourceOptions(all)).toHaveLength(3);
    expect(relativeComparisonSeries(all, 'median_intvty', '', keyB)).toEqual([]);
    expect(relativeComparisonSeries(all, 'median_intvty', keyA, keyA)).toEqual([]);
    expect(relativeComparisonSeries(all, 'median_intvty', 'unavailable', keyB)).toEqual([]);
    const separate = comparator.map((s) => ({
      point: { ...s.point, median_intvty: s.point.median_intvty! + 100 },
    }));
    expect(
      relativeComparisonSeries([...baseline, ...separate], 'median_intvty', keyA, keyB),
    ).toEqual([]);
  });

  it('does not bridge missing or conflicting duplicate X values', () => {
    const missing = {
      point: { ...baseline[0].point, median_intvty: 20, measuredAvgPower: undefined },
    };
    const curves = relativeComparisonSeries(
      [...baseline, missing, ...comparator],
      'median_intvty',
      keyA,
      keyB,
      25,
    );
    expect(curves[0].points[0].y).toBeNaN();
    expect(curves[0].points[1].y).toBeNaN();
    const conflict = source('b200', 20, 500, 900, 30);
    expect(
      relativeComparisonSeries([...baseline, ...comparator, conflict], 'median_intvty', keyA, keyB),
    ).toEqual([]);
  });
});
