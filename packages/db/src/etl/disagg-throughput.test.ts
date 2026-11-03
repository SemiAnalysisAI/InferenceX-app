import { describe, expect, it } from 'vitest';

import { perPoolThroughputPatch } from './disagg-throughput';

describe('perPoolThroughputPatch', () => {
  const perTotal = { tput_per_gpu: 1000, input_tput_per_gpu: 900, output_tput_per_gpu: 100 };

  it('rescales per-total rates to input per prefill chip and output per decode chip', () => {
    expect(perPoolThroughputPatch(perTotal, 4, 12)).toEqual({
      input_tput_per_gpu: (900 * 16) / 4,
      output_tput_per_gpu: (100 * 16) / 12,
    });
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
