import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { chipsWithoutSystemModel, hasRoleTelemetry } from './power-chip-coverage';

const metric = (y: number) => ({ y, roof: false });

function point(hwKey: string, overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    hwKey,
    precision: 'fp8',
    model: 'Qwen-3.5-397B-A17B',
    conc: 1,
    measuredAvgPower: metric(500),
    ...overrides,
  } as InferenceData;
}

describe('chipsWithoutSystemModel', () => {
  it('names chips with measured GPU power that have no breakdown series', () => {
    const points = [
      point('b200_sglang'),
      point('h200_sglang'),
      point('h200_sglang', { conc: 4 }),
      // No measured power: not a chip missing its model.
      point('mi355x_sglang', { measuredAvgPower: undefined }),
    ];
    const missing = chipsWithoutSystemModel(points, [{ key: 'b200_sglang|fp8' }]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('H200');
  });
});

describe('hasRoleTelemetry', () => {
  const disagg = (overrides: Partial<InferenceData> = {}) =>
    point('b200_dynamo-sglang', { disagg: true, median_intvty: 40, ...overrides });

  it('is false when disaggregated results carry no prefill/decode power, true with one role reading', () => {
    expect(hasRoleTelemetry([disagg(), point('h200_sglang')], 'median_intvty')).toBe(false);
    // One validated decode reading is enough.
    expect(
      hasRoleTelemetry(
        [disagg(), disagg({ measuredDecodeAvgPower: metric(420) })],
        'median_intvty',
      ),
    ).toBe(true);
  });
});
