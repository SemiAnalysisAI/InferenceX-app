import { describe, expect, it } from 'vitest';

import { perPoolThroughputPatch, withStoredPerPoolBasis } from './disagg-throughput';

describe('perPoolThroughputPatch', () => {
  const perTotal = { tput_per_gpu: 1000, input_tput_per_gpu: 900, output_tput_per_gpu: 100 };

  it('rescales per-total rates to input per prefill chip and output per decode chip', () => {
    expect(perPoolThroughputPatch(perTotal, 4, 12)).toEqual({
      input_tput_per_gpu: (900 * 16) / 4,
      output_tput_per_gpu: (100 * 16) / 12,
      input_tput_per_total_gpu: 900,
      output_tput_per_total_gpu: 100,
    });
  });

  it('never rescales a row that already holds its original per-total rates', () => {
    expect(
      perPoolThroughputPatch({ ...perTotal, input_tput_per_total_gpu: 900 }, 4, 12),
    ).toBeNull();
    expect(
      perPoolThroughputPatch({ ...perTotal, output_tput_per_total_gpu: 100 }, 4, 12),
    ).toBeNull();
  });

  it('is idempotent: a rescaled row no longer matches', () => {
    const patch = perPoolThroughputPatch(perTotal, 4, 12)!;
    expect(perPoolThroughputPatch({ ...perTotal, ...patch }, 4, 12)).toBeNull();
  });

  it.each([
    [1, 1],
    [1, 31],
    [31, 1],
    [8, 8],
  ])('never re-matches its own output for %i prefill / %i decode chips', (p, d) => {
    for (const share of [0, 0.01, 0.5, 0.99, 1]) {
      const row = {
        tput_per_gpu: 100,
        input_tput_per_gpu: 100 * share,
        output_tput_per_gpu: 100 * (1 - share),
      };
      const patch = perPoolThroughputPatch(row, p, d)!;
      expect(patch).not.toBeNull();
      expect(perPoolThroughputPatch({ ...row, ...patch }, p, d)).toBeNull();
    }
  });

  it('accepts float noise in the per-total sum', () => {
    expect(
      perPoolThroughputPatch({ ...perTotal, output_tput_per_gpu: 100.0004 }, 4, 12),
    ).not.toBeNull();
  });

  it.each([
    [
      'fixed-sequence per-pool rates',
      { tput_per_gpu: 1000, input_tput_per_gpu: 3600, output_tput_per_gpu: 133 },
      4,
      12,
    ],
    ['zero prefill chips', perTotal, 0, 12],
    ['zero decode chips', perTotal, 4, 0],
    ['missing total', { input_tput_per_gpu: 900, output_tput_per_gpu: 100 }, 4, 12],
    ['zero total', { ...perTotal, tput_per_gpu: 0 }, 4, 12],
    ['missing output', { tput_per_gpu: 1000, input_tput_per_gpu: 900 }, 4, 12],
    ['negative input', { ...perTotal, input_tput_per_gpu: -1 }, 4, 12],
    ['non-finite output', { ...perTotal, output_tput_per_gpu: Number.NaN }, 4, 12],
  ])('returns null for %s', (_label, metrics, p, d) => {
    expect(perPoolThroughputPatch(metrics, p, d)).toBeNull();
  });
});

function stored(overrides: Record<string, unknown> = {}) {
  return {
    benchmark_type: 'agentic_traces',
    disagg: true,
    is_multinode: true,
    num_prefill_gpu: 4,
    num_decode_gpu: 12,
    metrics: { tput_per_gpu: 1000, input_tput_per_gpu: 900, output_tput_per_gpu: 100 } as Record<
      string,
      number
    >,
    ...overrides,
  };
}

describe('withStoredPerPoolBasis', () => {
  it('reads an unbackfilled agentic row exactly as the backfill would store it', () => {
    const row = stored();
    const [read] = withStoredPerPoolBasis([row]);
    expect(read.metrics).toEqual({ ...row.metrics, ...perPoolThroughputPatch(row.metrics, 4, 12) });
    expect(row.metrics.input_tput_per_gpu).toBe(900);
  });

  it('returns backfilled rows unchanged', () => {
    const backfilled = stored({
      metrics: {
        tput_per_gpu: 1000,
        input_tput_per_gpu: 3600,
        output_tput_per_gpu: 133.33,
        input_tput_per_total_gpu: 900,
        output_tput_per_total_gpu: 100,
      },
    });
    expect(withStoredPerPoolBasis([backfilled])[0]).toBe(backfilled);
  });

  it.each([
    ['fixed-sequence rows', { benchmark_type: 'single_turn' }],
    ['aggregated rows', { disagg: false }],
    ['single-node rows, whose pool sizes are both the whole deployment', { is_multinode: false }],
  ])('leaves %s alone', (_label, overrides) => {
    const row = stored(overrides);
    expect(withStoredPerPoolBasis([row])[0]).toBe(row);
  });
});
