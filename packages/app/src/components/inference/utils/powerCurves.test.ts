import { groupConcurrencySeries } from './concurrency-series';
import { describe, expect, it } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import { chartDefinitions } from '@/components/inference/metric-registry';
import type { ParetoDirection } from '@/lib/chart-utils';

import {
  chartFrontier,
  isMeasuredPowerCurveMetric,
  isPowerCurveMetric,
  isPowerGaugeSeries,
  upperPowerEnvelope,
} from './powerCurves';

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
  it.each(chartDefinitions)(
    'keeps watts and percent TDP on the same $chartType frontier within a hardware series',
    (definition) => {
      const samples = [
        point(1, 200, 600),
        point(4, 160, 400),
        point(8, 120, 500),
        point(16, 100, 300),
      ].map((sample) => ({
        ...sample,
        x: definition.chartType === 'e2e' ? 1000 / sample.x : sample.x,
      }));
      const watts = chartFrontier(
        samples,
        definition.y_measuredAvgPower_roofline as ParetoDirection | undefined,
      );
      expect(watts.map((sample) => sample.conc).toSorted((a, b) => a - b)).toEqual([1, 4, 16]);
      // TDP is fixed within each hardware series. Converting its watts to a
      // percentage must neither admit the dominated point nor drop a tradeoff.
      for (const tdp of [700, 1000, 1400]) {
        const percentages = samples.map((sample) => ({ ...sample, y: (sample.y / tdp) * 100 }));
        const percentFrontier = chartFrontier(
          percentages,
          definition.y_measuredPowerPercentTdp_roofline as ParetoDirection | undefined,
        );
        expect(percentFrontier.map((sample) => sample.conc)).toEqual(
          watts.map((sample) => sample.conc),
        );
      }
    },
  );

  it('selects power gauges without changing energy chart semantics', () => {
    expect(isPowerCurveMetric('y_measuredAvgPower')).toBe(true);
    expect(isPowerCurveMetric('y_measuredP75Power')).toBe(true);
    expect(isPowerCurveMetric('y_measuredP90Power')).toBe(true);
    expect(isPowerCurveMetric('y_measuredPowerPercentTdp')).toBe(true);
    expect(isPowerCurveMetric('y_modeledChassisPowerPerGpu')).toBe(true);
    expect(isPowerCurveMetric('y_measuredJPerOutputToken')).toBe(false);
    expect(isPowerCurveMetric('y_tpPerGpu')).toBe(false);
    const points = [point(1, 200, 4), point(8, 100, 1)];
    expect(chartFrontier(points, 'lower_right')).toEqual(points);
  });

  it.each(['y_gpuProvisionedWatts', 'y_utilityProvisionedWatts', 'y_utilityModeledWatts'])(
    'draws %s as an envelope-locked power gauge like measured watts',
    (metric) => {
      expect(isPowerCurveMetric(metric)).toBe(true);
      expect(isMeasuredPowerCurveMetric(metric)).toBe(true);
    },
  );

  it.each([
    'y_gpuProvisionedJPerOutputToken',
    'y_utilityProvisionedJPerOutputToken',
    'y_utilityModeledJPerOutputToken',
  ])('keeps %s on the energy Pareto frontier', (metric) => {
    expect(isPowerCurveMetric(metric)).toBe(false);
    expect(isMeasuredPowerCurveMetric(metric)).toBe(false);
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
    const plateau = point(16, 3, 700);
    const slow = point(32, 4, 950);
    // Measured watts: a tie at the running maximum is a repeat marker, so the
    // plateau leaves the boundary and Optimal Only can collapse it; a repeated
    // X keeps only its first vertex.
    const samples = [slow, plateau, point(4, 2, 500), middle, { ...middle }, fast];
    expect(upperPowerEnvelope(samples, false)).toEqual([fast, middle, slow]);
    expect(
      upperPowerEnvelope(
        samples.map((p) => ({ ...p, x: 1000 / p.x })),
        true,
      ).map((p) => p.y),
    ).toEqual([950, 700, 350]);
    // A gauge keeps the plateau: it is part of the outer edge it draws.
    expect(upperPowerEnvelope(samples, false, true)).toEqual([fast, middle, plateau, slow]);
  });

  it('keeps a flat provisioned series across its tested range only when asked to', () => {
    // A TDP gauge is the same watts at every concurrency: with `keepTies` the
    // boundary spans the sweep; the strict measured rule would collapse it to
    // the first-sorted marker.
    const flat = [point(1, 200, 1000), point(8, 120, 1000), point(64, 40, 1000)];
    expect(upperPowerEnvelope(flat, true, true)).toEqual(flat.toReversed());
    expect(upperPowerEnvelope(flat, false, true).map((p) => p.x)).toEqual([40, 120, 200]);
    expect(upperPowerEnvelope(flat, true)).toEqual([flat[0]]);
    expect(upperPowerEnvelope(flat, false)).toEqual([flat[2]]);
  });

  it('keeps ties only for provisioned and modelled gauge series', () => {
    const measured = point(1, 200, 700);
    const tdpClone = {
      ...measured,
      powerVariant: { kind: 'basis', id: 'gpu-provisioned' } as const,
    };
    const measuredClone = {
      ...measured,
      powerVariant: { kind: 'basis', id: 'gpu-measured' } as const,
    };
    const roleClone = { ...measured, powerVariant: { kind: 'role', id: 'decode' } as const };
    expect(isPowerGaugeSeries('y_gpuProvisionedWatts', measured)).toBe(true);
    expect(isPowerGaugeSeries('y_utilityModeledWatts', undefined)).toBe(true);
    expect(isPowerGaugeSeries('y_measuredAvgPower', measured)).toBe(false);
    expect(isPowerGaugeSeries('y_measuredAvgPower', tdpClone)).toBe(true);
    expect(isPowerGaugeSeries('y_measuredAvgPower', measuredClone)).toBe(false);
    expect(isPowerGaugeSeries('y_measuredAvgPower', roleClone)).toBe(false);
    expect(isPowerGaugeSeries('y_gpuProvisionedWatts', roleClone)).toBe(false);
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

describe('observed concurrency series', () => {
  const load = (conc: number, overrides: Partial<InferenceData> = {}) =>
    point(conc, conc, 500, {
      run_url: 'https://github.com/org/repo/actions/runs/123',
      ...overrides,
    });

  it('retains non-monotonic measured points and sorts by exact load', () => {
    const points = [load(128, { y: 470 }), load(1, { y: 500 }), load(4, { y: 600 })];
    const segments = [...groupConcurrencySeries(points).values()];
    expect(segments).toHaveLength(1);
    expect(segments[0].map((sample) => [sample.x, sample.y])).toEqual([
      [1, 500],
      [4, 600],
      [128, 470],
    ]);
  });

  it('never connects different topology, recipes, runs, dates or role variants', () => {
    const base = load(1);
    const points = [
      base,
      load(4, { tp: 4 }),
      load(8, { recipe_fingerprint: 'other-recipe' }),
      load(16, { run_url: 'https://github.com/org/repo/actions/runs/456' }),
      load(32, { date: '2026-09-11' }),
      load(64, { powerVariant: { kind: 'role', id: 'prefill' } }),
    ];
    const segments = [...groupConcurrencySeries(points).values()];
    expect(segments).toHaveLength(points.length);
    expect(segments.flat()).toEqual(points);
  });

  it('keeps repeated load observations and unknown runs as markers, not an arbitrary average', () => {
    const points = [load(4), load(4, { y: 650 }), load(8), load(16, { run_url: undefined })];
    const segments = [...groupConcurrencySeries(points).values()];
    expect(segments.every((segment) => segment.length === 1)).toBe(true);
    expect(segments.flat()).toHaveLength(points.length);
    expect(segments.flat().map((sample) => sample.y)).toEqual([500, 650, 500, 500]);
  });
});
