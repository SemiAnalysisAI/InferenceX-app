import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';

import {
  CHIP_BASIS_METRICS,
  chipBasisCsvNote,
  disaggDeploymentChips,
  exactPerTotalChipRates,
  hasPoolSplit,
  inputTputPerTotalChip,
  measuredInputShare,
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

describe('measuredInputShare', () => {
  const split = {
    disagg: true,
    num_prefill_gpu: 4,
    num_decode_gpu: 12,
    prefill_num_workers: 1,
    decode_num_workers: 1,
    tput_per_gpu: 1000,
  };

  it('reads per-pool rates on the per-deployment-chip basis', () => {
    // 3600 per prefill chip × 4/16 = 900; 133.33 per decode chip × 12/16 = 100.
    expect(
      measuredInputShare(
        { ...split, input_tput_per_gpu: 3600, output_tput_per_gpu: 400 / 3 },
        0.01,
      ),
    ).toBeCloseTo(0.9, 9);
  });

  it('gives the same share for the same row on the total basis', () => {
    expect(
      measuredInputShare(
        { ...split, chip_basis: 'total', input_tput_per_gpu: 900, output_tput_per_gpu: 100 },
        0.01,
      ),
    ).toBeCloseTo(0.9, 9);
  });

  it('accepts rows that still carry raw per-total producer rates', () => {
    expect(
      measuredInputShare({ ...split, input_tput_per_gpu: 900, output_tput_per_gpu: 100 }, 0.01),
    ).toBeCloseTo(0.9, 9);
  });

  it('returns null when neither reading adds up', () => {
    expect(
      measuredInputShare({ ...split, input_tput_per_gpu: 500, output_tput_per_gpu: 100 }, 0.01),
    ).toBeNull();
    expect(measuredInputShare({ ...split, tput_per_gpu: 0 }, 0.01)).toBeNull();
  });
});

function flat(r: BenchmarkRow & { chip_basis?: 'pool' | 'total' }) {
  return { ...r, ...r.metrics };
}

describe('legacy unsplit disaggregated rows', () => {
  // Shape of the Oct–Nov 2025 Dynamo TRT rows: both pool fields hold the whole
  // deployment (36) and no workers are recorded, but ISL:OSL recovers the real
  // pools (4 prefill + 32 decode). 36 000 tok/s total, half input, half output.
  const legacy = () =>
    row({
      framework: 'dynamo-trt',
      is_multinode: false,
      prefill_num_workers: 0,
      decode_num_workers: 0,
      num_prefill_gpu: 36,
      num_decode_gpu: 36,
      isl: 1024,
      osl: 1024,
      metrics: {
        tput_per_gpu: 1000,
        input_tput_per_gpu: 18_000 / 4,
        output_tput_per_gpu: 18_000 / 32,
      },
    });

  it('converts to the total basis through ISL:OSL instead of the pool fields', () => {
    const total = withChipBasis(legacy(), 'total');
    expect(total.chip_basis).toBe('total');
    expect(total.metrics.input_tput_per_gpu).toBeCloseTo(500, 9);
    expect(total.metrics.output_tput_per_gpu).toBeCloseTo(500, 9);
    expect(total.metrics.tput_per_gpu).toBe(1000);
  });

  it('measures the same token mix on either basis', () => {
    const pool = legacy();
    expect(measuredInputShare(flat(pool), 0.01)).toBeCloseTo(0.5, 9);
    expect(measuredInputShare(flat(withChipBasis(pool, 'total')), 0.01)).toBeCloseTo(0.5, 9);
  });

  it('counts the deployment once, not once per pool', () => {
    expect(disaggDeploymentChips(legacy())).toBe(36);
    expect(hasPoolSplit(legacy())).toBe(false);
  });

  it('solves the pool share from the rates, not ISL:OSL', () => {
    // Row 51829 shape: 72 chips split 48 prefill / 24 decode, 8K/1K, where the ISL:OSL
    // split would overstate output by 6%.
    const solved = row({
      ...legacy(),
      num_prefill_gpu: 72,
      num_decode_gpu: 72,
      isl: 8192,
      osl: 1024,
      metrics: { tput_per_gpu: 993.65, input_tput_per_gpu: 1334.32, output_tput_per_gpu: 312.29 },
    });
    const total = withChipBasis(solved, 'total');
    expect(total.metrics.input_tput_per_gpu! + total.metrics.output_tput_per_gpu!).toBeCloseTo(
      993.65,
      9,
    );
    expect(total.metrics.output_tput_per_gpu).toBeCloseTo((312.29 * 24) / 72, 0);
  });

  it('passes through legacy rows already per deployment chip or with one rate', () => {
    const perTotal = row({
      ...legacy(),
      metrics: { tput_per_gpu: 1000, input_tput_per_gpu: 900, output_tput_per_gpu: 100 },
    });
    expect(withChipBasis(perTotal, 'total').metrics.input_tput_per_gpu).toBe(900);
    const outputOnly = row({
      ...legacy(),
      metrics: { tput_per_gpu: 1000, output_tput_per_gpu: 91.8 },
    });
    expect(withChipBasis(outputOnly, 'total').metrics.output_tput_per_gpu).toBe(91.8);
  });

  it('keeps rows it cannot convert on the stored basis', () => {
    // Equal rates leave the pool share undetermined, and no ISL/OSL to fall back on.
    const unknownMix = row({
      ...legacy(),
      isl: null,
      osl: null,
      metrics: { tput_per_gpu: 1000, input_tput_per_gpu: 600, output_tput_per_gpu: 600 },
    });
    expect(withChipBasis(unknownMix, 'total')).toBe(unknownMix);
    expect(exactPerTotalChipRates({ ...unknownMix, ...unknownMix.metrics })).toBeNull();
  });
});

describe('chipBasisCsvNote', () => {
  it('names the basis and its share-link value in both locales', () => {
    expect(chipBasisCsvNote('pool', 'en')).toContain('per prefill/decode chip');
    expect(chipBasisCsvNote('pool', 'en')).toContain('g_chips=pool');
    expect(chipBasisCsvNote('total', 'en')).toContain('every chip in the deployment');
    expect(chipBasisCsvNote('total', 'zh')).toContain('按芯片总数');
    expect(chipBasisCsvNote('total', 'zh')).toContain('g_chips=total');
  });
});

describe('hasPoolSplit', () => {
  const base = { disagg: true, num_prefill_gpu: 4, num_decode_gpu: 12 };
  it('reads worker counts or unequal pool fields as a real split', () => {
    expect(hasPoolSplit({ ...base, prefill_num_workers: 1, decode_num_workers: 1 })).toBe(true);
    expect(hasPoolSplit({ ...base, prefill_num_workers: 0, decode_num_workers: 0 })).toBe(true);
  });
  it('treats only the mirrored legacy shape as unsplit', () => {
    expect(
      hasPoolSplit({ ...base, num_prefill_gpu: 36, num_decode_gpu: 36, prefill_num_workers: 0 }),
    ).toBe(false);
    expect(hasPoolSplit({ ...base, disagg: false })).toBe(false);
  });
});
