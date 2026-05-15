import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { pickPairDefaults } from './compare-pair-defaults';

function makeRow(overrides: Partial<BenchmarkRow>): BenchmarkRow {
  return {
    hardware: 'h100',
    framework: 'sglang',
    model: 'dsr1',
    precision: 'fp8',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 1,
    prefill_ep: 1,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 1,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    isl: 8192,
    osl: 1024,
    conc: 64,
    image: null,
    metrics: { tput_per_gpu: 100 },
    date: '2026-01-01',
    run_url: null,
    ...overrides,
  };
}

describe('pickPairDefaults', () => {
  it('returns null/null when neither GPU has any rows', () => {
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'b200', isl: 8192, osl: 1024, precision: 'fp4', conc: 4 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: null,
      precision: null,
    });
  });

  it('returns null/null when only rows with an unmapped (isl,osl) exist for the pair', () => {
    const rows: BenchmarkRow[] = [
      // 123/456 is not a registered sequence — islOslToSequence returns undefined
      makeRow({ hardware: 'h100', isl: 123, osl: 456, conc: 8 }),
      makeRow({ hardware: 'gb200', isl: 123, osl: 456, conc: 8 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: null,
      precision: null,
    });
  });

  it('picks the (seq, precision) where both GPUs share the most variants', () => {
    // Both GPUs at 8K/1K fp8 share conc=64 + conc=128
    // gb200 also has 8K/1K fp4 — but h100 doesn't, so that combo has both=0
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 128 }),
      makeRow({ hardware: 'gb200', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'gb200', isl: 8192, osl: 1024, precision: 'fp8', conc: 128 }),
      makeRow({ hardware: 'gb200', isl: 8192, osl: 1024, precision: 'fp4', conc: 4 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });

  it('falls back to union coverage when no combo has overlap', () => {
    // No (seq, precision) is shared. h100 only at 8k/1k fp8; gb200 only at 1k/8k fp4.
    // Tiebreaker = larger combined coverage. Pad gb200 to win.
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 4 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 8 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 16 }),
    ];
    const result = pickPairDefaults(rows, 'h100', 'gb200');
    // gb200 has 3 variants on 1k/8k fp4; h100 has 1 on 8k/1k fp8 — gb200's combo wins.
    expect(result).toEqual({ sequence: '1k/8k', precision: 'fp4' });
  });

  it('returns the only combo when just one GPU has rows', () => {
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 128 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });

  it('ignores rows for unrelated GPUs', () => {
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'b200', isl: 8192, osl: 1024, precision: 'fp4', conc: 4 }),
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'gb200', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });
});
