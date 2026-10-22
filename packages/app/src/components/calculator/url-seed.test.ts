import { describe, expect, it } from 'vitest';

import { profitModelDefaults } from './profit-estimator';
import { parseProfitTargetParam, profitTargetUrlValue, resolveCalculatorUrlSeed } from './url-seed';
import { Model, Percentile, Precision, Sequence } from '@/lib/catalog/data-mappings';

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

  it('returns the agentic latency percentile when i_pctl is known', () => {
    expect(resolveCalculatorUrlSeed({ i_pctl: 'p75' })).toEqual({
      percentile: Percentile.P75,
    });
  });

  it('ignores an unknown agentic latency percentile', () => {
    expect(resolveCalculatorUrlSeed({ i_pctl: 'p99' })).toEqual({});
  });

  it('combines model, sequence, and precisions from the same URL', () => {
    expect(
      resolveCalculatorUrlSeed({
        g_model: 'DeepSeek-V4-Pro',
        i_seq: '1k/8k',
        i_prec: 'fp4,fp8',
        i_pctl: 'p75',
      }),
    ).toEqual({
      model: Model.DeepSeek_V4_Pro,
      sequence: Sequence.OneK_EightK,
      precisions: [Precision.FP4, Precision.FP8],
      percentile: Percentile.P75,
    });
  });

  it('includes valid run date and run ID for the single server-seeded provider', () => {
    expect(
      resolveCalculatorUrlSeed({
        g_rundate: '2026-08-20',
        g_runid: 'run_123',
      }),
    ).toEqual({
      runDate: '2026-08-20',
      runId: 'run_123',
    });
  });

  it('ignores invalid run date and run ID seeds', () => {
    expect(
      resolveCalculatorUrlSeed({
        g_rundate: '08/20/2026',
        g_runid: 'contains spaces',
      }),
    ).toEqual({});
  });

  it('picks the first value when a param is repeated as an array', () => {
    expect(resolveCalculatorUrlSeed({ g_model: ['DeepSeek-V4-Pro', 'GLM-5'] })).toEqual({
      model: Model.DeepSeek_V4_Pro,
    });
  });

  it('returns an empty seed for an empty searchParams object', () => {
    expect(resolveCalculatorUrlSeed({})).toEqual({});
  });

  it('seeds an exact profit interactivity target from c_ivtarget', () => {
    expect(resolveCalculatorUrlSeed({ c_ivtarget: '24' })).toEqual({ profitTarget: 24 });
    expect(resolveCalculatorUrlSeed({ c_ivtarget: '32.5' })).toEqual({ profitTarget: 32.5 });
  });

  it('ignores invalid c_ivtarget values so the model default applies', () => {
    for (const value of ['', '0', '0.0', '-1', 'NaN', 'Infinity', '100bad', '1e3', ' 24']) {
      expect(resolveCalculatorUrlSeed({ c_ivtarget: value })).toEqual({});
    }
  });

  it('does not read the retired fixed-8k/1k c_profit_target param', () => {
    expect(resolveCalculatorUrlSeed({ c_profit_target: '222' })).toEqual({});
  });
});

describe('parseProfitTargetParam', () => {
  it('returns undefined for a missing value', () => {
    expect(parseProfitTargetParam(undefined)).toBeUndefined();
  });

  it('round-trips the String() form the estimator writes', () => {
    for (const target of [1, 24, 32.123353678124, 125]) {
      expect(parseProfitTargetParam(String(target))).toBe(target);
    }
  });
});

describe('profitTargetUrlValue', () => {
  it("omits the target when it is the model's default, so default links are unchanged", () => {
    for (const model of [Model.DeepSeek_V4_Pro, Model.Kimi_K3, Model.GLM_5_2, Model.MiniMax_M3]) {
      expect(profitTargetUrlValue(model, profitModelDefaults(model).interactivity)).toBe('');
    }
  });

  it('writes a non-default target exactly and parses back to the same number', () => {
    for (const target of [24, 32.5, 32.123353678124, 200]) {
      const value = profitTargetUrlValue(Model.DeepSeek_V4_Pro, target);
      expect(value).toBe(String(target));
      expect(parseProfitTargetParam(value)).toBe(target);
    }
  });

  it("compares against the selected model's default, not a global one", () => {
    expect(profitTargetUrlValue(Model.DeepSeek_V4_Pro, 35)).toBe('');
    expect(profitTargetUrlValue(Model.Kimi_K3, 35)).toBe('35');
  });

  it('never writes a non-positive or non-finite target', () => {
    for (const target of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(profitTargetUrlValue(Model.Kimi_K3, target)).toBe('');
    }
  });
});
