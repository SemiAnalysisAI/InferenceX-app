import { describe, expect, it, vi } from 'vitest';

// compare-ssr transitively imports the DB-backed benchmark loader; this pure
// projection test never touches it, so stub the import chain out.
vi.mock('@/lib/benchmark-data.server', () => ({ getCachedBenchmarks: vi.fn() }));

import type { BenchmarkRow } from '@/lib/api';
import { computeCompareTableData } from '@/lib/compare-ssr';

import {
  buildCompareTable,
  buildPrecisionBreakdown,
  buildSpecDecodeBreakdown,
  compareRowsAtTiers,
  compareViewCsvRows,
} from './compare-view';

let nextId = 1;

function stubRow(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: nextId++,
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
    benchmark_type: 'single_turn',
    offload_mode: 'off',
    isl: 1024,
    osl: 1024,
    conc: 128,
    image: null,
    metrics: { tput_per_gpu: 100, median_intvty: 30 },
    date: '2026-03-01',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

function pairRows(precision = 'fp8'): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  const knots: [number, number][] = [
    [16, 40],
    [32, 30],
    [64, 20],
    [128, 10],
  ];
  for (const hardware of ['b200', 'h200']) {
    const scale = hardware === 'b200' ? 1.5 : 1;
    for (const [conc, intvty] of knots) {
      rows.push(
        stubRow({
          hardware,
          precision,
          conc,
          metrics: { tput_per_gpu: conc * 10 * scale, median_intvty: intvty },
        }),
      );
    }
  }
  return rows;
}

const ROWS = pairRows();
const TABLE_DATA = computeCompareTableData(ROWS, 'b200', 'h200', '1k/1k', 'fp8');

describe('buildCompareTable', () => {
  it('picks the higher-throughput side by default and strips nearestPoints', () => {
    const table = buildCompareTable(TABLE_DATA.ssrRows, 'default', 'b200', 'h200');
    expect(table.length).toBeGreaterThan(0);
    for (const row of table) {
      expect(row.basis).toBe('throughputPerGpu');
      expect(row.winner).toBe('b200');
      expect(row.deltaPct).toBeGreaterThan(0);
      expect(row.a).not.toHaveProperty('nearestPoints');
      expect(row.a?.hardware).toBe('b200');
      expect(row.a?.configKey).toBe('b200_sglang');
    }
  });

  it('flips the basis to cost for per-dollar and marks single-sided rows', () => {
    const perDollar = buildCompareTable(TABLE_DATA.ssrRows, 'per-dollar', 'b200', 'h200');
    for (const row of perDollar) {
      expect(row.basis).toBe('costPerMtok');
      expect(row.winner).toBe(
        (row.a?.costPerMtok ?? Infinity) < (row.b?.costPerMtok ?? Infinity) ? 'b200' : 'h200',
      );
    }
    const oneSided = buildCompareTable(
      TABLE_DATA.ssrRows.map((row) => ({ ...row, b: null })),
      'default',
      'b200',
      'h200',
    );
    for (const row of oneSided) {
      expect(row.winner).toBe('b200');
      expect(row.deltaPct).toBeNull();
    }
  });
});

describe('compareRowsAtTiers', () => {
  it('returns exactly the in-range requested tiers', () => {
    const rows = compareRowsAtTiers(
      ROWS,
      'b200',
      'h200',
      '1k/1k',
      'fp8',
      TABLE_DATA.interactivityRange,
      [15, 25, 500],
    );
    expect(rows.map((row) => row.target)).toEqual([15, 25]);
  });
});

describe('buildPrecisionBreakdown', () => {
  it('emits one entry per precision that has pair data', () => {
    const mixed = [...ROWS, ...pairRows('bf16')];
    const breakdown = buildPrecisionBreakdown(mixed, 'b200', 'h200', '1k/1k');
    expect(breakdown.map((entry) => entry.precision).toSorted()).toEqual(['bf16', 'fp8']);
    for (const entry of breakdown) {
      expect(entry.tiers.length).toBeGreaterThan(0);
      expect(entry.headToHead?.faster).toBe('B200');
    }
  });
});

describe('buildSpecDecodeBreakdown', () => {
  it('splits by spec method at the middle default target', () => {
    const breakdown = buildSpecDecodeBreakdown(
      ROWS,
      'b200',
      'h200',
      1024,
      1024,
      'fp8',
      TABLE_DATA.defaultTargets,
    );
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].specMethod).toBe('none');
    expect(breakdown[0].tier).toBe(TABLE_DATA.defaultTargets[1]);
    expect(breakdown[0].a?.throughputPerGpu).toBeGreaterThan(breakdown[0].b?.throughputPerGpu ?? 0);
  });
});

describe('compareViewCsvRows', () => {
  it('flattens one row per tier with a_/b_ prefixes', () => {
    const table = buildCompareTable(TABLE_DATA.ssrRows, 'default', 'b200', 'h200');
    const csvRows = compareViewCsvRows(table, 'DeepSeek-R1-0528', 'b200', 'h200', '1k/1k');
    expect(csvRows).toHaveLength(table.length);
    expect(csvRows[0]).toMatchObject({
      model: 'DeepSeek-R1-0528',
      scenario: '1k/1k',
      a_hardware: 'b200',
      b_hardware: 'h200',
      winner: 'b200',
    });
  });
});
