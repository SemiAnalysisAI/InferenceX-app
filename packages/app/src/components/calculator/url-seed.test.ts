import { describe, expect, it } from 'vitest';

import { resolveCalculatorUrlSeed } from './url-seed';
import { Model, Precision, Sequence } from '@/lib/data-mappings';

describe('resolveCalculatorUrlSeed', () => {
  it('returns the model when g_model is a known enum value', () => {
    expect(resolveCalculatorUrlSeed({ g_model: 'DeepSeek-V4-Pro' })).toEqual({
      model: Model.DeepSeek_V4_Pro,
    });
  });

  it('ignores unknown g_model values so SSR falls back to the default', () => {
    expect(resolveCalculatorUrlSeed({ g_model: 'not-a-model' })).toEqual({});
  });

  it('returns the sequence when i_seq is a known enum value', () => {
    expect(resolveCalculatorUrlSeed({ i_seq: '1k/1k' })).toEqual({
      sequence: Sequence.OneK_OneK,
    });
  });

  it('parses i_prec as a comma-separated list, dropping unknown precisions', () => {
    expect(resolveCalculatorUrlSeed({ i_prec: 'fp8,not-real,bf16' })).toEqual({
      precisions: [Precision.FP8, Precision.BF16],
    });
  });

  it('omits precisions when none of the supplied values are known', () => {
    expect(resolveCalculatorUrlSeed({ i_prec: 'garbage' })).toEqual({});
  });

  it('combines model, sequence, and precisions from the same URL', () => {
    expect(
      resolveCalculatorUrlSeed({
        g_model: 'DeepSeek-V4-Pro',
        i_seq: '1k/8k',
        i_prec: 'fp4,fp8',
      }),
    ).toEqual({
      model: Model.DeepSeek_V4_Pro,
      sequence: Sequence.OneK_EightK,
      precisions: [Precision.FP4, Precision.FP8],
    });
  });

  it('picks the first value when a param is repeated as an array', () => {
    expect(resolveCalculatorUrlSeed({ g_model: ['DeepSeek-V4-Pro', 'GLM-5'] })).toEqual({
      model: Model.DeepSeek_V4_Pro,
    });
  });

  it('returns an empty seed for an empty searchParams object', () => {
    expect(resolveCalculatorUrlSeed({})).toEqual({});
  });
});
