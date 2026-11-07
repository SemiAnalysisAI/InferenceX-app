import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import {
  chipsWithoutSystemModel,
  hasRoleTelemetry,
  unplottedModeledPower,
} from './power-chip-coverage';

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

const unsupported = (reason: 'hardware' | 'model-domain') => ({
  modeledSystemPower: { status: 'unsupported', reason, modelRevision: 'test' } as const,
});

describe('unplottedModeledPower', () => {
  it('groups points without a facility value by reason, keeping unofficial-run chips apart', () => {
    const official = [
      point('b200_sglang', { utilityModeledWatts: metric(900) }),
      point('rtx6000pro_vllm', unsupported('hardware')),
      point('rtx6000pro_vllm', { conc: 4, ...unsupported('hardware') }),
      // A compare-line clone is the same point, not another one.
      point('rtx6000pro_vllm', {
        ...unsupported('hardware'),
        powerVariant: { kind: 'basis', id: 'gpu-measured' },
      }),
      point('h200_sglang', unsupported('model-domain')),
    ];
    const overlay = [point('rtx6000pro_vllm', { run_url: 'run-2', ...unsupported('hardware') })];
    const groups = unplottedModeledPower(official, overlay, 'y_utilityModeledWatts', 'none', (p) =>
      p.run_url === 'run-2' ? 1 : 0,
    )!.reasons;
    expect(groups.map((g) => [g.reason, g.points])).toEqual([
      ['hardware', 3],
      ['model-domain', 1],
    ]);
    expect(groups[0].chips).toEqual([
      { label: expect.stringContaining('RTX'), points: 2, overlayRunIndex: undefined },
      { label: expect.stringContaining('RTX'), points: 1, overlayRunIndex: 1 },
    ]);
  });

  it('reports a GPU point drawn under Count: All as missing lines, not as an undrawn point', () => {
    const rows = [point('rtx6000pro_vllm', unsupported('hardware'))];
    const note = (yMetric: string, compare: 'none' | 'boundaries') =>
      unplottedModeledPower(rows, [], yMetric, compare, () => 0);
    expect(note('y_measuredAvgPower', 'none')).toBeNull();
    expect(note('y_measuredAvgPower', 'boundaries')).toMatchObject({
      missing: 'lines',
      bases: ['it-modeled', 'utility-modeled'],
      reasons: [{ reason: 'hardware', points: 1 }],
    });
    // On its own boundary the same point is not drawn at all.
    expect(note('y_itModeledWatts', 'none')).toMatchObject({
      missing: 'points',
      bases: ['it-modeled'],
    });
  });
});
