import { describe, expect, it } from 'vitest';

import type { InferenceData } from '../types';
import { expandPowerCompareSeries } from '../utils/power-compare';
import { roleGpuCounts, roleSplitRows } from './powerx-role-split';

function point(overrides: Partial<InferenceData>): InferenceData {
  return {
    x: 100,
    y: 1,
    hwKey: 'gb300_dynamo-trt',
    date: '2026-04-07',
    tp: 8,
    conc: 16,
    precision: 'fp4',
    tpPerGpu: { y: 1, roof: false },
    tpPerMw: { y: 1, roof: false },
    costh: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const disagg = (x: number, prefill: number, decode: number, extra: Partial<InferenceData> = {}) =>
  point({
    x,
    disagg: true,
    num_prefill_gpu: 8,
    num_decode_gpu: 32,
    reconstructedPrefillJPerOutputToken: { y: prefill, roof: false },
    measuredDecodeJPerOutputToken: { y: decode, roof: false },
    measuredJPerOutputToken: { y: prefill + decode, roof: false },
    measuredPrefillAvgPower: { y: 700, roof: false },
    measuredDecodeAvgPower: { y: 650, roof: false },
    ...extra,
  });

describe('roleSplitRows', () => {
  it('splits each disaggregated point so prefill + decode = measured J per output token', () => {
    const { groups } = roleSplitRows([disagg(220, 4.53, 20.68), disagg(40, 2, 8)]);
    expect(groups).toHaveLength(1);
    const rows = groups[0].rows;
    expect(rows.map((row) => row.point.x)).toEqual([40, 220]);
    for (const row of rows) {
      expect(row.prefillJ + row.decodeJ).toBeCloseTo(row.measuredJ, 9);
      expect(row.prefillShare).toBeCloseTo(row.prefillJ / row.measuredJ, 9);
    }
    expect(rows[1]).toMatchObject({ prefillGpus: 8, decodeGpus: 32 });
  });

  it('lists aggregated chips as not split instead of drawing a 0-GPU pool', () => {
    const mi355x = point({
      hwKey: 'mi355x_sglang',
      disagg: false,
      num_prefill_gpu: 8,
      num_decode_gpu: 0,
    });
    const { groups, unsplit } = roleSplitRows([disagg(220, 4, 20), mi355x]);
    expect(groups.map((group) => group.hwKey)).toEqual(['gb300_dynamo-trt']);
    expect(unsplit).toEqual([
      expect.objectContaining({ hwKey: 'mi355x_sglang', reason: 'aggregated' }),
    ]);
    expect(roleGpuCounts(mi355x)).toEqual({ prefill: 'aggregated', decode: 'aggregated' });
  });

  it('separates disaggregated runs that report no per-pool energy from aggregated ones', () => {
    const bare = point({
      hwKey: 'b200_dynamo-sglang',
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    });
    expect(roleSplitRows([bare]).unsplit[0].reason).toBe('no-telemetry');
  });

  it('ignores role clones and keeps overlay runs in their own groups', () => {
    const base = disagg(220, 4, 20, { run_url: 'https://github.com/o/r/actions/runs/1' });
    const cloned = expandPowerCompareSeries([base], 'y_measuredJPerOutputToken', 'roles');
    expect(cloned.length).toBeGreaterThan(1);
    const overlayAggregated = point({ hwKey: 'mi355x_sglang', disagg: false, run_url: 'x/runs/2' });
    const { groups, unsplit } = roleSplitRows(cloned, [base, overlayAggregated]);
    expect(groups.map((group) => [group.overlay, group.rows.length])).toEqual([
      [false, 1],
      [true, 1],
    ]);
    expect(unsplit).toEqual([expect.objectContaining({ overlay: true, reason: 'aggregated' })]);
  });
});
