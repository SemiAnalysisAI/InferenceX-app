import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { powerBaselineDeltas, powerBaselineMetric } from './power-baseline';
import { equalServiceSourceKey } from './equal-service-comparison';

const metric = (y: number) => ({ y, roof: false });
const point = (overrides: Partial<InferenceData>): InferenceData =>
  ({
    x: 10,
    y: 500,
    hwKey: 'b200_dynamo-sglang',
    date: '2026-09-01',
    tp: 4,
    conc: 16,
    precision: 'fp4',
    run_url: 'https://example.invalid/runs/1',
    measuredAvgPower: metric(500),
    measuredJPerOutputToken: metric(2.4),
    ...overrides,
  }) as InferenceData;

const b200 = [point({ conc: 16 }), point({ conc: 64, measuredAvgPower: metric(600) })];
const h200 = [
  point({ hwKey: 'h200_dynamo-sglang', conc: 16, measuredAvgPower: metric(450) }),
  point({ hwKey: 'h200_dynamo-sglang', conc: 256, measuredAvgPower: metric(700) }),
];
const baseline = equalServiceSourceKey(b200[0]);

describe('powerBaselineMetric', () => {
  it('maps only the measured GPU metrics the table can difference', () => {
    expect(powerBaselineMetric('y_measuredAvgPower')).toBe('meanWattsPerGpu');
    expect(powerBaselineMetric('y_measuredJPerOutputToken')).toBe('joulesPerOutputToken');
    expect(powerBaselineMetric('y_tpPerGpu')).toBeNull();
    expect(powerBaselineMetric('y_modeledChassisPowerPerGpu')).toBeNull();
  });
});

describe('powerBaselineDeltas', () => {
  it('differences every other row from the baseline at the same concurrency', () => {
    const deltas = powerBaselineDeltas([...b200, ...h200], baseline, 'meanWattsPerGpu');
    expect(deltas.get(h200[0])).toMatchObject({ status: 'observed', value: -50 });
    expect(deltas.get(h200[0])).toHaveProperty('percent', expect.closeTo(-10, 9));
    expect(deltas.get(b200[0])).toEqual({ status: 'baseline' });
    expect(deltas.get(b200[1])).toEqual({ status: 'baseline' });
  });

  it('leaves a load the baseline never ran without a delta instead of interpolating', () => {
    const deltas = powerBaselineDeltas([...b200, ...h200], baseline, 'meanWattsPerGpu');
    expect(deltas.get(h200[1])).toEqual({ status: 'unavailable' });
  });

  it('refuses a baseline load whose repeated readings disagree', () => {
    const repeat = point({ conc: 16, measuredAvgPower: metric(520) });
    const deltas = powerBaselineDeltas([...b200, repeat, ...h200], baseline, 'meanWattsPerGpu');
    expect(deltas.get(h200[0])).toEqual({ status: 'unavailable' });
  });

  it('never differences boundary or role clones against the GPU baseline', () => {
    const clone = point({
      hwKey: 'h200_dynamo-sglang',
      conc: 16,
      measuredAvgPower: metric(450),
      powerVariant: { kind: 'basis', id: 'utility-provisioned' },
    });
    const deltas = powerBaselineDeltas([...b200, clone], baseline, 'meanWattsPerGpu');
    expect(deltas.get(clone)).toEqual({ status: 'unavailable' });
  });
});
