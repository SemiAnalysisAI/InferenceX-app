import { describe, expect, it } from 'bun:test';

import type { InferenceData } from '../types';
import { expandPowerCompareSeries } from '../utils/power-compare';
import { roleSplitRows } from './powerx-role-split';

const point = (overrides: Partial<InferenceData>) =>
  ({ x: 100, y: 1, conc: 16, precision: 'fp4', disagg: true, ...overrides }) as InferenceData;

describe('roleSplitRows', () => {
  it('groups rows per run, ignoring role clones, and lists unsplit chips by why', () => {
    const base = point({
      hwKey: 'gb300_dynamo-trt',
      num_prefill_gpu: 8,
      num_decode_gpu: 32,
      reconstructedPrefillJPerOutputToken: { y: 4, roof: false },
      measuredDecodeJPerOutputToken: { y: 20, roof: false },
      measuredJPerOutputToken: { y: 24, roof: false },
      run_url: 'https://github.com/o/r/actions/runs/1',
    });
    const cloned = expandPowerCompareSeries([base], 'y_measuredJPerOutputToken', 'roles');
    expect(cloned.length).toBeGreaterThan(1);
    // Disaggregated without per-pool energy is not the same as aggregated (every GPU does both).
    const bare = point({ hwKey: 'b200_dynamo-sglang', num_prefill_gpu: 4, num_decode_gpu: 4 });
    const overlayAggregated = point({ hwKey: 'mi355x_sglang', disagg: false, run_url: 'x/runs/2' });
    const { groups, unsplit } = roleSplitRows([...cloned, bare], [base, overlayAggregated]);
    expect(groups.map((group) => [group.overlay, group.rows.length])).toEqual([
      [false, 1],
      [true, 1],
    ]);
    expect(unsplit.map(({ hwKey, overlay, reason }) => [hwKey, overlay, reason])).toEqual([
      ['b200_dynamo-sglang', false, 'no-telemetry'],
      ['mi355x_sglang', true, 'aggregated'],
    ]);
  });
});
