import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import {
  chipsWithoutSystemModel,
  hasRoleTelemetry,
  modeledPowerSeries,
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
const fields = (yMetric: string, compare: 'none' | 'boundaries') =>
  modeledPowerSeries(yMetric, compare).map((series) => series.field);

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
    const groups = unplottedModeledPower(
      official,
      overlay,
      fields('y_utilityModeledWatts', 'none'),
      (p) => (p.run_url === 'run-2' ? 1 : 0),
    );
    expect(groups.map((g) => [g.reason, g.points])).toEqual([
      ['hardware', 3],
      ['model-domain', 1],
    ]);
    expect(groups[0].chips).toEqual([
      { label: expect.stringContaining('RTX'), points: 2, overlayRunIndex: undefined },
      { label: expect.stringContaining('RTX'), points: 1, overlayRunIndex: 1 },
    ]);
  });

  it('flags a drawn GPU point whose IT and facility lines are missing under Count: All', () => {
    const gpuOnly = [point('rtx6000pro_vllm', unsupported('hardware'))];
    expect(
      unplottedModeledPower(gpuOnly, [], fields('y_measuredAvgPower', 'none'), () => 0),
    ).toEqual([]);
    expect(
      unplottedModeledPower(gpuOnly, [], fields('y_measuredAvgPower', 'boundaries'), () => 0),
    ).toMatchObject([{ reason: 'hardware', points: 1 }]);
  });
});
