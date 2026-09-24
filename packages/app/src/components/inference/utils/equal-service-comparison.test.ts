import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import {
  buildEqualServiceComparison,
  equalServiceSourceKey,
  getEqualServiceComparisonCurve,
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

  it('uses exact observations without interpolation and accepts consistent repeated observations', () => {
    const result = buildEqualServiceComparison([...a, { ...a[0], id: 5 }, ...b], {
      ...options,
      target: 20,
    });
    expect(result.metrics.meanWattsPerGpu.baseline).toMatchObject({
      value: 400,
      interpolated: false,
    });
    expect(result.metrics.meanWattsPerGpu.baseline?.endpoints.map(({ point: p }) => p.id)).toEqual([
      1, 5,
    ]);
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

  it('rejects conflicting duplicate X per quantity instead of averaging them', () => {
    const conflict = point({ ...a[0], id: 5, measuredAvgPower: metric(401) });
    const result = buildEqualServiceComparison([...a, conflict, ...b], options);
    expect(result.metrics.meanWattsPerGpu.reason).toBe('ambiguous-x');
    expect(result.metrics.meanWattsPerGpu.changePercent).toBeNull();
    expect(result.metrics.joulesPerOutputToken.changePercent).toBe(-40);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('withholds invalid metric %s', (value) => {
    const rows = a.map((p) => ({ ...p, measuredAvgPower: metric(value) }));
    expect(
      buildEqualServiceComparison([...rows, ...b], options).metrics.meanWattsPerGpu.reason,
    ).toBe('missing-metric');
  });

  it('rejects extrapolation, invalid target, same source, unknown source and concurrency as service', () => {
    expect(
      buildEqualServiceComparison([...a, ...b], { ...options, target: 61 }).metrics.meanWattsPerGpu
        .reason,
    ).toBe('out-of-range');
    expect(buildEqualServiceComparison([...a, ...b], { ...options, target: NaN }).reason).toBe(
      'invalid-target',
    );
    expect(
      buildEqualServiceComparison([...a, ...b], { ...options, comparator: options.baseline })
        .reason,
    ).toBe('same-source');
    expect(
      buildEqualServiceComparison([...a, ...b], { ...options, comparator: 'missing' }).reason,
    ).toBe('unknown-source');
    expect(buildEqualServiceComparison([...a, ...b], { ...options, xField: 'conc' }).reason).toBe(
      'unsupported-axis',
    );
  });

  it('keeps run, actual date, topology, recipe, image, runtime and attempt isolated', () => {
    const variants = [
      { run_url: 'https://example.invalid/runs/3' },
      { actualDate: '2026-09-22' },
      { decode_pp: 2 },
      { recipe_fingerprint: 'recipe-2' },
      { image: 'new-image' },
      { spec_decoding: 'mtp' },
      { kv_offload_backend: 'other' },
    ];
    for (const variant of variants) {
      const altered = point({ ...a[1], ...variant });
      expect(equalServiceSourceKey(altered)).not.toBe(options.baseline);
      expect(
        buildEqualServiceComparison([a[0], altered, ...b], options).metrics.meanWattsPerGpu.reason,
      ).toBe('out-of-range');
    }
    const attempted = { ...a[0], run_attempt: 2 };
    expect(equalServiceSourceKey(attempted)).not.toBe(options.baseline);
    expect(equalServiceSourceKey(point({ id: 1, run_url: undefined }))).not.toBe(
      equalServiceSourceKey(point({ id: 2, run_url: undefined })),
    );
    expect(getEqualServiceSources([...b, ...a])).toEqual(getEqualServiceSources([...a, ...b]));
  });

  it('labels sources in the page locale and keeps English for the API default', () => {
    const labelled = {
      ...point({ id: 1, recipe_fingerprint: 'r1', run_url: undefined }),
      run_attempt: 2,
    };
    const [zh] = getEqualServiceSources([labelled], 'zh');
    for (const part of ['单节点', '数据点 1', '第 2 次尝试', '配方 r1'])
      expect(zh.label).toContain(part);
    expect(zh.label).not.toMatch(/Single-node|Point|Attempt|Recipe/u);
    const [en] = getEqualServiceSources([labelled]);
    for (const part of ['Single-node', 'Point 1', 'Attempt 2', 'Recipe r1'])
      expect(en.label).toContain(part);
    expect(en.key).toBe(zh.key);
  });

  it('keeps source keys stable across UI display-date overrides and uses the requested mean basis', () => {
    expect(equalServiceSourceKey({ ...a[0], date: '2026-09-24', actualDate: a[0].date })).toBe(
      equalServiceSourceKey(a[0]),
    );
    const rows = [...a, ...b].map((p) => ({ ...p, mean_tpot_intvty: p.mean_intvty! / 2 }));
    const result = buildEqualServiceComparison(rows, {
      ...options,
      xField: 'mean_tpot_intvty',
      target: 20,
    });
    expect(result.metrics.meanWattsPerGpu.baseline?.value).toBe(600);
    expect(result.metrics.meanWattsPerGpu.changePercent).toBe(50);
  });

  it('ignores comparison clones and hidden sources, supports ordinary overlay run URLs', () => {
    const overlay = a.map((p) => ({
      ...p,
      id: undefined,
      run_url: 'https://example.invalid/runs/overlay',
    }));
    const result = buildEqualServiceComparison(
      [
        ...overlay,
        ...b,
        { ...a[0], powerVariant: { kind: 'basis', id: 'gpu-provisioned' } },
        { ...a[1], hidden: true },
      ],
      { ...options, baseline: equalServiceSourceKey(overlay[0]) },
    );
    expect(result.metrics.meanWattsPerGpu.changePercent).toBe(50);
    expect(result.baseline?.label).toContain('overlay');
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

  it('evaluates sorted observed-X union only within overlap and retains missing knots', () => {
    const inner = b.map((p, i) => ({ ...p, mean_intvty: i ? 50 : 30 }));
    const curve = getEqualServiceComparisonCurve(
      [...a, ...inner, point({ id: 5, mean_intvty: 40, measuredAvgPower: undefined })],
      options,
    );
    expect(curve.map((row) => row.target)).toEqual([30, 40, 50]);
    expect(curve[1].metrics.meanWattsPerGpu.reason).toBe('missing-metric');
    expect(getEqualServiceComparisonCurve([...a, ...b], { ...options, xField: 'conc' })).toEqual(
      [],
    );
  });

  it('reuses measured same-window role accounting, not the nominal input:output ratio', () => {
    const pd = point({
      disagg: true,
      power_valid: 1,
      power_metric_schema_version: 2,
      joules_per_input_token: 2,
      joules_per_output_token: 10,
      prefill_joules_per_input_token: 1,
      decode_joules_per_output_token: 5,
    });
    const [share] = getPrefillSharePoints([pd, { ...pd, power_valid: 0 }], 'mean_intvty');
    expect(share).toMatchObject({
      x: 20,
      prefill: 5,
      decode: 5,
      total: 10,
      prefillShare: 50,
      sourceKey: equalServiceSourceKey(pd),
      point: pd,
    });
    expect(getPrefillSharePoints([pd], 'conc')[0]).toMatchObject({ x: pd.conc, prefillShare: 50 });
  });

  it('keeps role-local denominators apart from the additive output-token reconstruction', () => {
    // GB200 1P1D at c4 (PowerX Figure 12): prefill 272 W/GPU, decode 421 W/GPU.
    const pd = point({
      hwKey: 'gb200_dynamo-sglang',
      disagg: true,
      conc: 4,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
      power_valid: 1,
      power_metric_schema_version: 2,
      joules_per_input_token: 0.65,
      joules_per_output_token: 5.2,
      prefill_joules_per_input_token: 0.25,
      decode_joules_per_output_token: 3.2,
      measuredPrefillAvgPower: metric(272),
      measuredDecodeAvgPower: metric(421),
      measuredPrefillJPerInputToken: metric(0.25),
      measuredDecodeJPerOutputToken: metric(3.2),
    });
    const [role] = getRolePoints([pd], 'conc');
    expect(role).toMatchObject({
      x: 4,
      prefillWattsPerGpu: 272,
      decodeWattsPerGpu: 421,
      prefillJoulesPerInputToken: 0.25,
      decodeJoulesPerOutputToken: 3.2,
    });
    // Prefill J/input × served J/out ÷ J/in = 0.25 × 8 = 2 J per output token.
    expect(role.energy!.prefill).toBeCloseTo(2, 12);
    expect(role.energy!.total).toBeCloseTo(5.2, 12);
    expect(role.energy!.prefillShare).toBeCloseTo((100 * 2) / 5.2, 12);
  });

  it('keeps role watts without reconstructable energy and drops rows with no role figure', () => {
    const wattsOnly = point({
      disagg: true,
      measuredPrefillAvgPower: metric(240),
      measuredDecodeAvgPower: metric(330),
    });
    const [role] = getRolePoints(
      [wattsOnly, point({ disagg: true }), point({ measuredPrefillAvgPower: metric(1) })],
      'mean_intvty',
    );
    expect(role).toMatchObject({
      prefillWattsPerGpu: 240,
      decodeWattsPerGpu: 330,
      prefillJoulesPerInputToken: null,
      energy: null,
    });
    expect(getRolePoints([wattsOnly, point({ disagg: true })], 'mean_intvty')).toHaveLength(1);
    expect(getRolePoints([wattsOnly], 'tpPerGpu' as never)).toEqual([]);
  });
});
