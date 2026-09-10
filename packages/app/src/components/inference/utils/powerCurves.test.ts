import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { chartFrontier, groupOperatingCurvePoints, isPowerCurveMetric } from './powerCurves';

function point(conc: number, x: number, y: number, overrides: Partial<InferenceData> = {}) {
  return {
    hwKey: 'b200_sglang',
    precision: 'fp8',
    date: '2026-09-10',
    tp: 8,
    conc,
    x,
    y,
    tpPerGpu: { y: 100, roof: false },
    tpPerMw: { y: 100, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } satisfies InferenceData;
}

describe('power operating curves', () => {
  it('connects the power sweep while retaining the single true Pareto winner', () => {
    const fast = point(1, 200, 350);
    const medium = point(8, 100, 700);
    const slow = point(32, 50, 950);
    const input = Object.freeze([slow, fast, medium]);
    const segments = [...groupOperatingCurvePoints(input).values()];

    expect(segments).toEqual([[fast, medium, slow]]);
    expect(segments[0][0]).toBe(fast);
    expect(input).toEqual([slow, fast, medium]);
    expect(chartFrontier([...input], 'lower_right')).toEqual([fast]);
    expect(chartFrontier([...input], undefined)).toEqual([]);
  });

  it('keeps concurrency order when measured interactivity is non-monotonic', () => {
    const points = [point(1, 200, 350), point(8, 80, 700), point(32, 90, 950)];
    expect([...groupOperatingCurvePoints(points).values()]).toEqual([points]);
  });

  it.each<Partial<InferenceData>>([
    { tp: 4 },
    { precision: 'fp4' },
    { hwKey: 'b200_sglang_mtp' },
    { date: '2026-09-09' },
    { run_url: 'https://github.com/o/r/actions/runs/2' },
    { decode_ep: 8 },
    { prefill_tp: 4 },
    { prefill_ep: 4 },
    { disagg: true, num_prefill_gpu: 4, num_decode_gpu: 8 },
    { physicalChips: 16 },
    { dp: 2 },
    { offload_mode: 'on' },
    { recipe_fingerprint: 'another-recipe' },
    { benchmark_type: 'agentic_traces', spec_decoding: 'mtp' },
  ])('never joins different configuration/date/run identities: %j', (overrides) => {
    const base = [point(1, 200, 350), point(8, 100, 700)];
    const different = [point(1, 210, 400, overrides), point(8, 110, 750, overrides)];
    expect([...groupOperatingCurvePoints([...base, ...different]).values()]).toEqual([
      base,
      different,
    ]);
  });

  it('deduplicates identical vertices but breaks curves at ambiguous repeated concurrency', () => {
    const first = point(1, 200, 350);
    const ambiguous = [point(8, 100, 700), point(8, 110, 710)];
    const tail = [point(16, 80, 800), point(32, 50, 950)];
    expect([
      ...groupOperatingCurvePoints([first, { ...first }, ...ambiguous, ...tail]).values(),
    ]).toEqual([[first], [ambiguous[0]], [ambiguous[1]], tail]);
  });

  it('excludes unusable coordinates and concurrency from line vertices', () => {
    const valid = [point(1, 200, 350), point(8, 100, 700)];
    const invalid = [point(16, 0, 800), point(32, 50, NaN), point(NaN, 50, 950)];
    expect([...groupOperatingCurvePoints([...valid, ...invalid]).values()]).toEqual([valid]);
  });

  it('selects power gauges without changing energy chart semantics', () => {
    expect(isPowerCurveMetric('y_measuredAvgPower')).toBe(true);
    expect(isPowerCurveMetric('y_measuredP90Power')).toBe(true);
    expect(isPowerCurveMetric('y_measuredPowerPercentTdp')).toBe(true);
    expect(isPowerCurveMetric('y_modeledChassisPowerPerGpu')).toBe(true);
    expect(isPowerCurveMetric('y_measuredJPerOutputToken')).toBe(false);
    expect(isPowerCurveMetric('y_tpPerGpu')).toBe(false);
    const points = [point(1, 200, 4), point(8, 100, 1)];
    expect(chartFrontier(points, 'lower_right')).toEqual(points);
  });

  it('preserves the canonical agentic restriction on Pareto membership', () => {
    const canonical = point(8, 100, 1, { isOnNormalizedInteractivityFrontier: true });
    const nonCanonical = point(1, 200, 4, { isOnNormalizedInteractivityFrontier: false });
    expect(chartFrontier([canonical, nonCanonical], 'lower_right')).toEqual([canonical]);
  });
});
