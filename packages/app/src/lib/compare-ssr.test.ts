import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

import { computeCompareImageRows } from './compare-ssr';

function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    hardware: 'h200',
    framework: 'sglang',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 8,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 8,
    num_decode_gpu: 8,
    isl: 1024,
    osl: 1024,
    conc: 128,
    image: null,
    metrics: { tput_per_gpu: 100, median_intvty: 30 },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  };
}

function pairRows(): BenchmarkRow[] {
  return [
    stubRow({ hardware: 'h200', conc: 16, metrics: { tput_per_gpu: 800, median_intvty: 10 } }),
    stubRow({ hardware: 'h200', conc: 32, metrics: { tput_per_gpu: 600, median_intvty: 20 } }),
    stubRow({ hardware: 'h200', conc: 64, metrics: { tput_per_gpu: 400, median_intvty: 30 } }),
    stubRow({ hardware: 'h200', conc: 128, metrics: { tput_per_gpu: 200, median_intvty: 40 } }),
    stubRow({ hardware: 'b200', conc: 16, metrics: { tput_per_gpu: 900, median_intvty: 10 } }),
    stubRow({ hardware: 'b200', conc: 32, metrics: { tput_per_gpu: 700, median_intvty: 20 } }),
    stubRow({ hardware: 'b200', conc: 64, metrics: { tput_per_gpu: 500, median_intvty: 30 } }),
    stubRow({ hardware: 'b200', conc: 128, metrics: { tput_per_gpu: 250, median_intvty: 40 } }),
  ];
}

describe('computeCompareImageRows', () => {
  const range = { min: 10, max: 40 };

  it('returns 17 evenly-spaced samples when no includeTargets are passed', () => {
    const rows = computeCompareImageRows(pairRows(), 'h200', 'b200', '1k/1k', 'fp8', range);
    expect(rows.length).toBe(17);
    expect(rows.at(0)?.target).toBe(10);
    expect(rows.at(-1)?.target).toBe(40);
  });

  it('inserts includeTargets as exact samples without dropping the even grid', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [17, 25, 33],
    );
    const targets = rows.map((r) => r.target);
    expect(targets).toContain(17);
    expect(targets).toContain(25);
    expect(targets).toContain(33);
    // Endpoints from the even grid still present.
    expect(targets).toContain(10);
    expect(targets).toContain(40);
    // Strictly increasing — required so curve-partition by target works.
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i]).toBeGreaterThan(targets[i - 1]);
    }
  });

  it('drops includeTargets that fall outside the interactivity range', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [-5, 9, 41, 1000],
    );
    const targets = rows.map((r) => r.target);
    expect(targets).not.toContain(-5);
    expect(targets).not.toContain(9);
    expect(targets).not.toContain(41);
    expect(targets).not.toContain(1000);
    // The even grid is unaffected when every includeTarget is rejected.
    expect(rows.length).toBe(17);
  });

  it('dedupes includeTargets that already coincide with an even-grid sample', () => {
    const rows = computeCompareImageRows(
      pairRows(),
      'h200',
      'b200',
      '1k/1k',
      'fp8',
      range,
      [10, 40],
    );
    expect(rows.length).toBe(17);
    expect(rows.filter((r) => r.target === 10).length).toBe(1);
    expect(rows.filter((r) => r.target === 40).length).toBe(1);
  });

  it('returns an empty array when the interactivity range is degenerate', () => {
    expect(
      computeCompareImageRows(
        pairRows(),
        'h200',
        'b200',
        '1k/1k',
        'fp8',
        { min: 20, max: 20 },
        [20],
      ),
    ).toEqual([]);
  });
});
