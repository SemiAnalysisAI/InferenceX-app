import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { chipsWithoutSystemModel } from './power-chip-coverage';

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
    const points = [point('b200_sglang'), point('h200_sglang'), point('h200_sglang', { conc: 4 })];
    const missing = chipsWithoutSystemModel(points, [{ key: 'b200_sglang|fp8' }]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('H200');
  });

  it('ignores hidden points, power variants and points without measured power', () => {
    const points = [
      point('h200_sglang', { hidden: true }),
      point('h100_sglang', { powerVariant: { kind: 'basis', id: 'utility-modeled' } }),
      point('mi355x_sglang', { measuredAvgPower: undefined }),
    ];
    expect(chipsWithoutSystemModel(points, [])).toEqual([]);
  });
});
