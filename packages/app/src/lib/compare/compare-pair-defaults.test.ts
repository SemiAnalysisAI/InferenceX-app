import { describe, expect, it } from 'bun:test';

import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { pickPairDefaults } from './compare-pair-defaults';

function makeRow(overrides: Partial<BenchmarkRow>): BenchmarkRow {
  return {
    id: 1,
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
    benchmark_type: 'single_turn',
    offload_mode: 'off',
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
      makeRow({ hardware: 'h100', isl: 123, osl: 456, conc: 8 }),
      makeRow({ hardware: 'gb200', isl: 123, osl: 456, conc: 8 }),
    ];
    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: null,
      precision: null,
    });
  });

  it('picks the (seq, precision) where both GPUs share the most variants', () => {
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
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', isl: 8192, osl: 1024, precision: 'fp8', conc: 64 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 4 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 8 }),
      makeRow({ hardware: 'gb200', isl: 1024, osl: 8192, precision: 'fp4', conc: 16 }),
    ];
    const result = pickPairDefaults(rows, 'h100', 'gb200');
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

  it('recognizes AgentX rows without fixed input or output lengths', () => {
    const rows: BenchmarkRow[] = [
      makeRow({
        hardware: 'h100',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: 'fp8',
      }),
      makeRow({
        hardware: 'gb200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        precision: 'fp8',
      }),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200')).toEqual({
      sequence: 'agentic-traces',
      precision: 'fp8',
    });
  });

  it('honors an available preferred scenario before overlap ranking', () => {
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', conc: 32 }),
      makeRow({ hardware: 'h100', conc: 64 }),
      makeRow({ hardware: 'gb200', conc: 32 }),
      makeRow({ hardware: 'gb200', conc: 64 }),
      makeRow({
        hardware: 'h100',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        conc: 8,
      }),
      makeRow({
        hardware: 'gb200',
        benchmark_type: 'agentic_traces',
        isl: null,
        osl: null,
        conc: 8,
      }),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', 'agentic-traces')).toEqual({
      sequence: 'agentic-traces',
      precision: 'fp8',
    });
    expect(pickPairDefaults(rows, 'h100', 'gb200', '8k/1k')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });

  it('falls back to the best available scenario when the preference has no rows', () => {
    const rows: BenchmarkRow[] = [
      makeRow({ hardware: 'h100', conc: 64 }),
      makeRow({ hardware: 'gb200', conc: 64 }),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', 'agentic-traces')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });
});

const AGENTIC = { benchmark_type: 'agentic_traces', isl: null, osl: null } as const;

/** One measured row per interactivity, with concurrency shared across chips so the variants match. */
function curve(
  hardware: string,
  interactivities: number[],
  overrides: Partial<BenchmarkRow> = {},
): BenchmarkRow[] {
  return interactivities.map((intvty, i) =>
    makeRow({
      hardware,
      conc: 16 * (i + 1),
      metrics: { tput_per_gpu: 1000 - intvty * 10, median_intvty: intvty },
      ...overrides,
    }),
  );
}

function agenticCurve(hardware: string, itls: number[]): BenchmarkRow[] {
  return itls.map((itl, i) =>
    makeRow({
      hardware,
      ...AGENTIC,
      conc: 16 * (i + 1),
      metrics: { tput_per_gpu: 1000 - i * 100, p90_itl: itl },
    }),
  );
}

describe('pickPairDefaults interactivity coverage', () => {
  it('passes over a preferred scenario only one chip ran for one where both chips overlap', () => {
    const rows = [
      ...agenticCurve('h100', [0.1, 0.05, 0.025]),
      ...curve('h100', [10, 20, 30]),
      ...curve('gb200', [15, 25, 35]),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', 'agentic-traces')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });

  it('tries the preferred sequence at its other precisions before other sequences', () => {
    const rows = [
      // Both chips ran fp4 at the same concurrencies, but never at the same interactivity.
      ...curve('h100', [10, 20, 30], { precision: 'fp4' }),
      ...curve('gb200', [50, 60, 70], { precision: 'fp4' }),
      ...curve('h100', [10, 20]),
      ...curve('gb200', [15, 25]),
      ...curve('h100', [10, 20, 30, 40], { isl: 1024, osl: 1024 }),
      ...curve('gb200', [10, 20, 30, 40], { isl: 1024, osl: 1024 }),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', '8k/1k')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });

  it('keeps the preferred scenario when no combination has a shared span', () => {
    const rows = [
      ...agenticCurve('h100', [0.1, 0.05]),
      ...curve('h100', [10, 20]),
      ...curve('gb200', [40, 50]),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', 'agentic-traces')).toEqual({
      sequence: 'agentic-traces',
      precision: 'fp8',
    });
  });

  it('picks a precision of the required sequence even when another sequence ranks higher', () => {
    const rows = [
      ...agenticCurve('h100', [0.1, 0.05]),
      ...agenticCurve('gb200', [0.1, 0.05]),
      ...curve('h100', [10, 20, 30, 40, 50], { precision: 'fp4' }),
      ...curve('h100', [10, 20], { precision: 'bf16' }),
      ...curve('gb200', [15, 25], { precision: 'bf16' }),
    ];

    expect(pickPairDefaults(rows, 'h100', 'gb200', 'agentic-traces', '8k/1k')).toEqual({
      sequence: '8k/1k',
      precision: 'bf16',
    });
  });

  it('does not count rows without total throughput as data', () => {
    const rows = [
      ...curve('b200', [10, 20, 30, 40], { precision: 'fp4' }),
      ...curve('vr200', [10, 20, 30, 40], { precision: 'fp4' }).map((row) => ({
        ...row,
        metrics: { output_tput_per_gpu: 4000, median_intvty: row.metrics.median_intvty },
      })),
      ...curve('b200', [10, 20]),
      ...curve('vr200', [15, 25]),
    ];

    expect(pickPairDefaults(rows, 'b200', 'vr200', '8k/1k')).toEqual({
      sequence: '8k/1k',
      precision: 'fp8',
    });
  });
});
