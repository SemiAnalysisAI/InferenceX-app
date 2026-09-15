import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import { powerMetricAvailability, powerMetricState } from './power-metric-availability';
import { createMockInferenceData } from '../../../../cypress/support/mock-data';

function point(overrides: Partial<InferenceData> = {}) {
  return createMockInferenceData(overrides);
}
describe('PowerX availability', () => {
  it('separates strict, validated unversioned, no verdict, invalid and missing without hiding zero', () => {
    const values = { measuredAvgPower: { y: 0, roof: false } };
    const rows = [
      point({ ...values, power_valid: 1, power_metric_schema_version: 2 }),
      point({ ...values, power_valid: 1 }),
      point(values),
      point({ power_valid: 0, ...values }),
      point(),
    ];
    expect(
      powerMetricAvailability(rows).find((row) => row.metric === 'y_measuredAvgPower'),
    ).toMatchObject({
      available: 3,
      total: 5,
      counts: { strict: 1, validated: 1, unverified: 1, invalid: 1, missing: 1 },
    });
  });
  it('retains real role metrics while distinguishing shared pools and ambiguous old deployment energy', () => {
    expect(powerMetricState(point(), 'y_measuredPrefillAvgPower')).toBe('inapplicable');
    expect(
      powerMetricState(
        point({
          disagg: true,
          power_valid: 1,
          power_metric_schema_version: 2,
          measuredPrefillJPerInputToken: { y: 2, roof: false },
        }),
        'y_measuredPrefillJPerInputToken',
      ),
    ).toBe('strict');
    expect(
      powerMetricState(point({ disagg: true, power_valid: 1 }), 'y_measuredJPerInputToken'),
    ).toBe('ambiguous');
  });
  it('counts the actual conversion and percentile fields independently', () => {
    const rows = [
      point({
        power_valid: 1,
        power_metric_schema_version: 2,
        measuredWhPerSuccessfulQuery: { y: 1, roof: false },
        measuredPowerPercentTdp: { y: 40, roof: false },
      }),
    ];
    const byMetric = Object.fromEntries(
      powerMetricAvailability(rows).map((row) => [row.metric, row.available]),
    );
    expect(byMetric.y_measuredWhPerSuccessfulQuery).toBe(1);
    expect(byMetric.y_measuredPowerPercentTdp).toBe(1);
    expect(byMetric.y_measuredP75Power).toBe(0);
    expect(byMetric.y_measuredP90Power).toBe(0);
  });
});
