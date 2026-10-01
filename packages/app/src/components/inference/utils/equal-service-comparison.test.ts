import { describe, expect, it } from 'vitest';
import type { AggDataEntry, InferenceData } from '../types';
import {
  buildEqualServiceComparison,
  equalServiceSourceKey,
  getEqualServiceComparisonCurve,
  getEqualServiceRange,
  getEqualServiceSources,
  getPrefillSharePoints,
  getRolePoints,
} from './equal-service-comparison';

const metric = (y: number) => ({ y, roof: false });
function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 20,
    y: 500,
    hwKey: 'b200_sglang',
    date: '2026-09-23',
    tp: 4,
    physicalChips: 4,
    precision: 'fp8',
    conc: 8,
    run_url: 'https://example.invalid/runs/1',
    model: 'qwen3.5',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 4,
    mean_intvty: 20,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(400),
    measuredJPerOutputToken: metric(10),
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    ...overrides,
  };
}
const a = [
  point({ id: 1 }),
  point({
    id: 2,
    mean_intvty: 60,
    conc: 1,
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 150,
    measuredJPerOutputToken: metric(30),
  }),
];
const b = [
  point({
    id: 3,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/2',
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 100,
    measuredJPerOutputToken: metric(8),
  }),
  point({
    id: 4,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/2',
    mean_intvty: 60,
    conc: 1,
    measuredAvgPower: metric(1000),
    output_tput_per_gpu: 200,
    measuredJPerOutputToken: metric(16),
  }),
];
const options = {
  baseline: equalServiceSourceKey(a[0]),
  comparator: equalServiceSourceKey(b[0]),
  target: 40,
  xField: 'mean_intvty' as const,
};

describe('equal-service comparison', () => {
  it('interpolates each raw quantity first, retains endpoints, and uses one percentage sign convention', () => {
    const result = buildEqualServiceComparison([...a, ...b], options);
    expect(result.metrics.meanWattsPerGpu).toMatchObject({
      baseline: { value: 600, interpolated: true },
      comparator: { value: 900 },
      changePercent: 50,
    });
    expect(result.metrics.outputTokensPerSecond).toMatchObject({
      baseline: { value: 400 },
      comparator: { value: 600 },
      changePercent: 50,
    });
    expect(result.metrics.joulesPerOutputToken).toMatchObject({
      baseline: { value: 20 },
      comparator: { value: 12 },
      changePercent: -40,
    });
    expect(
      result.metrics.meanWattsPerGpu.baseline?.endpoints.map(({ point: p }) => [
        p.id,
        p.conc,
        p.run_url,
      ]),
    ).toEqual([
      [1, 8, a[0].run_url],
      [2, 1, a[1].run_url],
    ]);
    // Interpolating the endpoint percentages instead would incorrectly give 62.5%.
    expect(result.metrics.meanWattsPerGpu.changePercent).not.toBe(62.5);
  });

  it('does not skip a missing interior measurement or turn it into zero', () => {
    const gap = point({ id: 5, mean_intvty: 40, measuredAvgPower: undefined });
    const result = buildEqualServiceComparison([...a, gap, ...b], { ...options, target: 50 });
    expect(result.metrics.meanWattsPerGpu).toMatchObject({
      baseline: null,
      changePercent: null,
      reason: 'missing-metric',
    });
    expect(result.metrics.outputTokensPerSecond.changePercent).not.toBeNull();
  });

  it('scales aggregate output by physical chips, but PD output by decode GPUs only', () => {
    const aggregate = point({ physicalChips: 8, tp: 2 });
    const pd = point({
      hwKey: 'gb200',
      disagg: true,
      physicalChips: 8,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    });
    const result = buildEqualServiceComparison([aggregate, pd], {
      ...options,
      baseline: equalServiceSourceKey(aggregate),
      comparator: equalServiceSourceKey(pd),
      target: 20,
    });
    expect(result.metrics.outputTokensPerSecond).toMatchObject({
      baseline: { value: 400 },
      comparator: { value: 200 },
      changePercent: -50,
    });
    const invalid = { ...pd, num_decode_gpu: 0 };
    expect(
      buildEqualServiceComparison([aggregate, invalid], {
        ...options,
        baseline: equalServiceSourceKey(aggregate),
        comparator: equalServiceSourceKey(invalid),
        target: 20,
      }).metrics.outputTokensPerSecond.reason,
    ).toBe('missing-metric');
  });

  it('labels sources by hardware and date, adding only the details that tell them apart', () => {
    const sources = getEqualServiceSources([
      point({ id: 1 }),
      point({ id: 2, physicalChips: 8, decode_tp: 8 }),
      point({ id: 3, run_url: 'https://example.invalid/runs/3' }),
      point({ id: 4, hwKey: 'b300_sglang', run_url: 'https://example.invalid/runs/2' }),
    ]);
    expect(sources.map((source) => source.label)).toEqual([
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU4 · TP4 · EP? · Run #1',
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU8 · TP8 · EP?',
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU4 · TP4 · EP? · Run #3',
      'B300 (SGLang) · 2026-09-23',
    ]);
  });

  it('keys a stitched append-only curve by its snapshot; rows without one keep their own run', () => {
    // B200 TP4: run 35905882425 appended c1–c4 onto run 35843506474's c8–c128.
    const snapshot = { curve_workflow_run_id: 35843506474, curve_date: '2026-09-20' };
    const stitched = [
      point({
        id: 1,
        conc: 8,
        actualDate: '2026-09-20',
        power_audit: { producer_sha: 'producer-a', exporter_image_sha256: 'exporter-a' },
        ...snapshot,
      }),
      point({
        id: 2,
        conc: 1,
        actualDate: '2026-09-23',
        run_url: 'https://example.invalid/runs/35905882425/attempts/1',
        power_audit: { producer_sha: 'producer-b', exporter_image_sha256: 'exporter-b' },
        ...snapshot,
      }),
    ];
    const laterSnapshot = point({
      id: 3,
      actualDate: '2026-09-20',
      curve_workflow_run_id: 35900000000,
      curve_date: '2026-09-20',
    });
    const legacy = [
      point({ id: 4, hwKey: 'b300_sglang', run_url: 'https://example.invalid/runs/7' }),
      point({ id: 5, hwKey: 'b300_sglang', run_url: 'https://example.invalid/runs/8' }),
    ];
    expect(equalServiceSourceKey(stitched[0])).toBe(equalServiceSourceKey(stitched[1]));
    expect(equalServiceSourceKey(legacy[0])).not.toBe(equalServiceSourceKey(legacy[1]));
    const sources = getEqualServiceSources([...stitched, laterSnapshot, ...legacy]);
    expect(sources.map((source) => source.label)).toEqual([
      'B200 (SGLang) · 2026-09-20 · Run #35843506474',
      'B200 (SGLang) · 2026-09-20 · Run #35900000000',
      'B300 (SGLang) · 2026-09-23 · Run #7',
      'B300 (SGLang) · 2026-09-23 · Run #8',
    ]);
  });

  it.each([
    { image: 'another-image' },
    { recipe_fingerprint: 'another-recipe' },
    { decode_tp: 8, physicalChips: 8 },
    { curve_workflow_run_id: 2 },
  ])('keeps distinct snapshot configurations separate: %j', (variant) => {
    const original = point({ curve_workflow_run_id: 1, curve_date: '2026-09-20' });
    expect(getEqualServiceSources([original, { ...original, ...variant }])).toHaveLength(2);
  });

  it.each([{ producer_sha: 'another-producer' }, { exporter_image_sha256: 'another-exporter' }])(
    'keeps producer distinctions when no snapshot authorizes stitching: %j',
    (power_audit) => {
      expect(getEqualServiceSources([point(), point({ power_audit })])).toHaveLength(2);
    },
  );

  it.each(['p75_e2e_norm_intvty', 'p90_e2e_norm_intvty'] as const)(
    'compares the derived %s axis from point.x at observed and interpolated targets',
    (xField) => {
      const rows = [...a, ...b].map((entry) => ({
        ...entry,
        benchmark_type: 'agentic_traces',
        x: entry.mean_intvty!,
        mean_intvty: 999,
      }));
      const derivedOptions = {
        baseline: equalServiceSourceKey(rows[0]),
        comparator: equalServiceSourceKey(rows[2]),
        xField: xField as keyof AggDataEntry,
      };
      const result = buildEqualServiceComparison(rows, { ...derivedOptions, target: 40 });
      expect(result.reason).toBeUndefined();
      expect(result.metrics.meanWattsPerGpu).toMatchObject({
        baseline: { value: 600, interpolated: true },
        comparator: { value: 900, interpolated: true },
        changePercent: 50,
      });
      expect(result.metrics.joulesPerOutputToken.changePercent).toBe(-40);
      expect(
        result.metrics.meanWattsPerGpu.baseline?.endpoints.map(({ x, point: endpoint }) => [
          x,
          endpoint.id,
        ]),
      ).toEqual([
        [20, 1],
        [60, 2],
      ]);
      expect(getEqualServiceRange(rows, derivedOptions)).toEqual({ min: 20, max: 60 });
      expect(
        getEqualServiceComparisonCurve(rows, derivedOptions).map(({ target }) => target),
      ).toEqual([20, 60]);

      const exact = buildEqualServiceComparison(rows, { ...derivedOptions, target: 20 });
      expect(exact.metrics.meanWattsPerGpu).toMatchObject({
        baseline: { value: 400, interpolated: false },
        comparator: { value: 800, interpolated: false },
        changePercent: 100,
      });
      expect(
        exact.metrics.meanWattsPerGpu.baseline?.endpoints.map(({ point: endpoint }) => endpoint.id),
      ).toEqual([1]);
      for (const target of [19, 61]) {
        expect(
          buildEqualServiceComparison(rows, { ...derivedOptions, target }).metrics.meanWattsPerGpu,
        ).toMatchObject({
          baseline: null,
          comparator: null,
          changePercent: null,
          reason: 'out-of-range',
        });
      }
    },
  );

  it('returns only the common service range and retains a shared exact endpoint', () => {
    const rows = [...a, ...b.map((entry) => ({ ...entry, mean_intvty: entry.mean_intvty! + 40 }))];
    expect(getEqualServiceRange(rows, options)).toEqual({ min: 60, max: 60 });
    expect(getEqualServiceComparisonCurve(rows, options).map(({ target }) => target)).toEqual([60]);
    expect(
      buildEqualServiceComparison(rows, { ...options, target: 60 }).metrics.meanWattsPerGpu,
    ).toMatchObject({
      baseline: { value: 800, interpolated: false },
      comparator: { value: 800, interpolated: false },
      changePercent: 0,
    });
    const disjoint = [
      ...a,
      ...b.map((entry) => ({ ...entry, mean_intvty: entry.mean_intvty! + 41 })),
    ];
    expect(getEqualServiceRange(disjoint, options)).toBeNull();
    expect(getEqualServiceComparisonCurve(disjoint, options)).toEqual([]);
    expect(
      getEqualServiceRange([...a, ...b], { ...options, comparator: options.baseline }),
    ).toBeNull();
    expect(
      getEqualServiceRange([...a, ...b], { ...options, comparator: 'unknown-source' }),
    ).toBeNull();
  });

  it('keeps missing and conflicting derived observations inside the range without skipping them', () => {
    const rows = [...a, ...b].map((entry) => ({ ...entry, x: entry.mean_intvty! }));
    const derivedOptions = { ...options, xField: 'p90_e2e_norm_intvty' as keyof AggDataEntry };
    const missing = { ...rows[0], id: 5, x: 40, measuredAvgPower: undefined };
    expect(getEqualServiceRange([...rows, missing], derivedOptions)).toEqual({ min: 20, max: 60 });
    expect(
      buildEqualServiceComparison([...rows, missing], { ...derivedOptions, target: 50 }).metrics
        .meanWattsPerGpu,
    ).toMatchObject({ baseline: null, changePercent: null, reason: 'missing-metric' });
    const conflicting = { ...rows[0], id: 6, measuredAvgPower: metric(401) };
    expect(
      buildEqualServiceComparison([...rows, conflicting], { ...derivedOptions, target: 20 }).metrics
        .meanWattsPerGpu,
    ).toMatchObject({ baseline: null, changePercent: null, reason: 'ambiguous-x' });
    expect(
      buildEqualServiceComparison([...rows, conflicting], { ...derivedOptions, target: 20 }).metrics
        .joulesPerOutputToken.changePercent,
    ).toBeCloseTo(-20);
  });

  it('excludes invalid, hidden and cloned derived coordinates from the overlap', () => {
    const rows = [...a, ...b].map((entry) => ({ ...entry, x: entry.mean_intvty! }));
    const derivedOptions = { ...options, xField: 'p90_e2e_norm_intvty' as keyof AggDataEntry };
    const extras = [
      ...[0, -1, NaN, Infinity].map((x) => ({ ...a[0], x })),
      { ...a[0], x: 1, hidden: true },
      { ...b[0], x: 100, powerVariant: { kind: 'basis', id: 'gpu-provisioned' } as const },
    ];
    expect(getEqualServiceRange([...rows, ...extras], derivedOptions)).toEqual({
      min: 20,
      max: 60,
    });
    expect(
      getEqualServiceComparisonCurve([...rows, ...extras], derivedOptions).map(
        ({ target }) => target,
      ),
    ).toEqual([20, 60]);
    expect(getEqualServiceRange([...extras, ...rows.slice(2)], derivedOptions)).toBeNull();
    for (const target of [0, -1, NaN, Infinity]) {
      expect(buildEqualServiceComparison(rows, { ...derivedOptions, target }).reason).toBe(
        'invalid-target',
      );
    }
  });

  it.each(['conc', 'x', 'output_tput_per_gpu', 'p99_e2e_norm_intvty'] as const)(
    'does not interpret %s as an available service axis',
    (xField) => {
      const unsupported = { ...options, xField: xField as keyof AggDataEntry };
      expect(buildEqualServiceComparison([...a, ...b], unsupported).reason).toBe(
        'unsupported-axis',
      );
      expect(getEqualServiceRange([...a, ...b], unsupported)).toBeNull();
      expect(getEqualServiceComparisonCurve([...a, ...b], unsupported)).toEqual([]);
    },
  );

  it('plots role panels on the trace-derived P75/P90 axes from point.x', () => {
    const role = (overrides: Partial<InferenceData>) =>
      point({
        disagg: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 4,
        power_valid: 1,
        power_metric_schema_version: 2,
        joules_per_input_token: 1,
        joules_per_output_token: 8,
        prefill_joules_per_input_token: 0.4,
        decode_joules_per_output_token: 4.8,
        measuredPrefillAvgPower: metric(300),
        measuredDecodeAvgPower: metric(500),
        ...overrides,
      });
    // The chart and the views API both store the derived value on `x` only.
    const rows = [
      role({ id: 1, x: 31.2 }),
      role({ id: 2, x: 24.8, conc: 16 }),
      role({ id: 3, x: 28, hwKey: 'b300_sglang', run_url: 'https://example.invalid/runs/2' }),
    ];
    const derived = 'p90_e2e_norm_intvty' as keyof AggDataEntry;
    expect(getRolePoints(rows, derived).map((row) => row.x)).toEqual([24.8, 31.2, 28]);
    expect(getPrefillSharePoints(rows, derived).map((row) => row.x)).toEqual([24.8, 31.2, 28]);
    expect(getRolePoints(rows, 'p75_e2e_norm_intvty' as keyof AggDataEntry)).toHaveLength(3);
  });
});
