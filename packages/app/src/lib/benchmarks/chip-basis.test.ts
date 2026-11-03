import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';

import {
  CHIP_BASIS_METRICS,
  inputTputPerTotalChip,
  perTotalChipRates,
  rowsWithChipBasis,
  totalChipFactors,
  withChipBasis,
  withTotalChipQualifier,
} from './chip-basis';

function row(overrides: Partial<BenchmarkRow> = {}): BenchmarkRow {
  return {
    id: 1,
    hardware: 'gb300',
    framework: 'dynamo-sglang',
    model: 'dsr1',
    precision: 'fp4',
    spec_method: 'none',
    disagg: true,
    is_multinode: true,
    prefill_tp: 4,
    prefill_ep: 4,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: 8,
    decode_ep: 8,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 4,
    num_decode_gpu: 12,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc: 64,
    offload_mode: 'off',
    image: null,
    metrics: { tput_per_gpu: 1000, input_tput_per_gpu: 3600, output_tput_per_gpu: 133 },
    date: '2026-10-01',
    run_url: null,
    ...overrides,
  } as BenchmarkRow;
}

describe('totalChipFactors', () => {
  it('scales each pool to its share of every deployment chip', () => {
    expect(totalChipFactors(row())).toEqual({ input: 4 / 16, output: 12 / 16 });
  });

  it.each([
    ['aggregated rows', { disagg: false }],
    [
      'legacy rows without a real prefill/decode split',
      { prefill_num_workers: 0, decode_num_workers: 0, num_prefill_gpu: 72, num_decode_gpu: 72 },
    ],
    ['a missing prefill pool', { num_prefill_gpu: 0 }],
    ['a missing decode pool', { num_decode_gpu: 0 }],
  ])('leaves %s alone', (_label, overrides) => {
    expect(totalChipFactors(row(overrides))).toBeNull();
  });
});

describe('withChipBasis', () => {
  it('returns the stored row untouched on the per-pool basis', () => {
    const source = row();
    expect(withChipBasis(source, 'pool')).toBe(source);
  });

  it('rescales input and output to every chip without mutating the source', () => {
    const source = row();
    const total = withChipBasis(source, 'total');
    expect(total.chip_basis).toBe('total');
    expect(total.metrics.input_tput_per_gpu).toBeCloseTo(3600 / 4, 9);
    expect(total.metrics.output_tput_per_gpu).toBeCloseTo((133 * 12) / 16, 9);
    expect(total.metrics.tput_per_gpu).toBe(1000);
    expect(source.metrics.input_tput_per_gpu).toBe(3600);
    expect(source).not.toHaveProperty('chip_basis');
  });

  it('is idempotent', () => {
    const once = withChipBasis(row(), 'total');
    expect(withChipBasis(once, 'total')).toBe(once);
  });

  it('keeps aggregated rows identical under both bases', () => {
    const aggregated = row({ disagg: false, num_prefill_gpu: 8, num_decode_gpu: 8 });
    expect(withChipBasis(aggregated, 'total')).toBe(aggregated);
  });

  it('keeps missing rates missing', () => {
    const source = row({ metrics: { tput_per_gpu: 1000 } });
    expect(withChipBasis(source, 'total').metrics).toEqual({ tput_per_gpu: 1000 });
  });

  it('maps a whole row set', () => {
    const rows = [row(), row({ disagg: false })];
    expect(rowsWithChipBasis(rows, 'pool')).toBe(rows);
    expect(rowsWithChipBasis(rows, 'total').map((r) => r.chip_basis)).toEqual(['total', undefined]);
  });
});

describe('inputTputPerTotalChip', () => {
  it('converts per-pool input so it adds up with tput_per_gpu', () => {
    expect(
      inputTputPerTotalChip({
        disagg: true,
        prefill_num_workers: 1,
        decode_num_workers: 1,
        num_prefill_gpu: 4,
        num_decode_gpu: 12,
        input_tput_per_gpu: 3600,
      }),
    ).toBeCloseTo(900, 9);
  });

  it('reads rescaled and aggregated rows as already per total chip', () => {
    expect(
      inputTputPerTotalChip({
        disagg: true,
        num_prefill_gpu: 4,
        num_decode_gpu: 12,
        input_tput_per_gpu: 900,
        chip_basis: 'total',
      }),
    ).toBe(900);
    expect(inputTputPerTotalChip({ disagg: false, input_tput_per_gpu: 900 })).toBe(900);
  });
});

describe('perTotalChipRates', () => {
  it('returns the same per-deployment-chip rates for a row on either basis', () => {
    const pool = row();
    expect(perTotalChipRates({ ...pool, ...pool.metrics })).toEqual({
      input: 900,
      output: (133 * 12) / 16,
    });
    const total = withChipBasis(pool, 'total');
    expect(perTotalChipRates({ ...total, ...total.metrics })).toEqual({
      input: 900,
      output: (133 * 12) / 16,
    });
  });
});

describe('withTotalChipQualifier', () => {
  it('names the denominator in both languages', () => {
    expect(withTotalChipQualifier('Output Token Throughput per Chip', 'en')).toBe(
      'Output Token Throughput per Chip (All Chips)',
    );
    expect(withTotalChipQualifier('每芯片输出 token 吞吐量', 'zh')).toBe(
      '每芯片输出 token 吞吐量（按芯片总数）',
    );
    expect(withTotalChipQualifier(undefined, 'en')).toBeUndefined();
  });

  it('covers every metric whose caveat offers the toggle', () => {
    for (const key of CHIP_BASIS_METRICS) expect(key.startsWith('y_')).toBe(true);
    expect(CHIP_BASIS_METRICS.has('y_tpPerGpu')).toBe(false);
    expect(CHIP_BASIS_METRICS.has('y_tokenRevenuePerGpuHour')).toBe(false);
  });
});
