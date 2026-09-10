import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';

import { chartFrontier, isPowerCurveMetric, upperPowerEnvelope } from './powerCurves';

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

describe('power chart semantics', () => {
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

describe('upper power envelope', () => {
  it('removes concurrency backtracking across configurations without changing measurements', () => {
    // H100-style sweep: more concurrency can move both left and right on X.
    const fast = point(1, 172.49, 252.22, { tp: 8 });
    const middle = point(2, 149.32, 291.38);
    const peak = point(128, 25.69, 502.54, { decode_ep: 8 });
    const dominated = point(64, 20.51, 344.95, { decode_ep: 8 });
    const slower = point(256, 4.65, 372.9, { decode_ep: 8 });
    const input = Object.freeze([fast, middle, dominated, peak, slower]);
    expect(upperPowerEnvelope(input, true)).toEqual([peak, middle, fast]);
    expect(input).toEqual([fast, middle, dominated, peak, slower]);
    expect(chartFrontier([...input], 'lower_right')).toEqual([fast]);
  });

  it('mirrors the boundary for latency and resolves tied coordinates deterministically', () => {
    const fast = point(1, 1, 350);
    const middle = point(8, 2, 700);
    const slow = point(32, 4, 950);
    const samples = [slow, point(16, 3, 700), point(4, 2, 500), middle, { ...middle }, fast];
    expect(upperPowerEnvelope(samples, false)).toEqual([fast, middle, slow]);
    expect(
      upperPowerEnvelope(
        samples.map((p) => ({ ...p, x: 1000 / p.x })),
        true,
      ).map((p) => p.y),
    ).toEqual([950, 700, 350]);
  });

  it('uses only finite positive coordinates and preserves singleton boundaries', () => {
    const valid = point(1, 200, 350);
    expect(upperPowerEnvelope([], true)).toEqual([]);
    expect(
      upperPowerEnvelope(
        [
          point(1, 0, 900),
          point(1, NaN, 900),
          point(1, Infinity, 900),
          point(1, 10, Infinity),
          point(1, 10, NaN),
          point(1, 10, 0),
          point(1, 10, -1),
          valid,
        ],
        true,
      ),
    ).toEqual([valid]);
  });
});
