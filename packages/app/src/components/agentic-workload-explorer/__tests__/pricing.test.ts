import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  detectFastMode,
  computeCostBreakdown,
  sanitizeModel,
  detectOpenAIFastMode,
} from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

describe('estimateCost', () => {
  const baseParams = {
    model: null as string | null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheWriteTokens: 0,
    isFastMode: false,
  };

  it('returns null for null model', () => {
    expect(estimateCost({ ...baseParams, model: null })).toBeNull();
  });

  it('returns null for unknown model', () => {
    expect(estimateCost({ ...baseParams, model: 'gpt-4' })).toBeNull();
  });

  it('prices codex-auto-review like GPT-5.6 and shows its name', () => {
    const params = { ...baseParams, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(estimateCost({ ...params, model: 'codex-auto-review' })).toBe(
      estimateCost({ ...params, model: 'gpt-5.6' }),
    );
    expect(sanitizeModel('codex-auto-review')).toBe('codex-auto-review');
  });

  it('prices Claude Opus 5.5 and GPT-6 Sol / Luna at published rates', () => {
    const oneMillionEach = {
      ...baseParams,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      timestampMs: Date.parse('2026-09-25T00:00:00Z'),
    };
    // Opus 5.5: $4 in + $20 out (no long-context surcharge on Anthropic models).
    expect(estimateCost({ ...oneMillionEach, model: 'claude-opus-5-5' })).toBeCloseTo(24);
    // GPT-6 Sol / Luna over 272k input: 2x input, 1.5x output.
    expect(estimateCost({ ...oneMillionEach, model: 'gpt-6-sol' })).toBeCloseTo(4 + 15);
    expect(estimateCost({ ...oneMillionEach, model: 'gpt-6-luna' })).toBeCloseTo(0.2 + 0.75);
    for (const model of ['claude-opus-5-5', 'gpt-6-sol', 'gpt-6-luna']) {
      expect(sanitizeModel(model)).toBe(model);
    }
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost({ ...baseParams, model: 'claude-opus-4-6' })).toBe(0);
  });

  it('calculates opus input cost correctly', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6',
      inputTokens: 1_000_000,
    });
    expect(cost).toBe(5); // $5 per 1M input tokens
  });

  it('calculates opus output cost correctly', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6',
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(25); // $25 per 1M output tokens
  });

  it('calculates opus cache read cost', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6',
      cacheReadInputTokens: 1_000_000,
    });
    expect(cost).toBe(0.5); // $0.50 per 1M cache read tokens
  });

  it('calculates opus cache creation cost', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6',
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBe(6.25); // $6.25 per 1M cache creation tokens
  });

  it('applies 2x fast mode pricing to an Opus 5 alias', () => {
    const standardCost = estimateCost({
      ...baseParams,
      model: 'opus5',
      inputTokens: 1_000_000,
    })!;
    const fastCost = estimateCost({
      ...baseParams,
      model: 'opus5',
      inputTokens: 1_000_000,
      isFastMode: true,
    })!;
    expect(fastCost).toBe(standardCost * 2);
  });

  it('preserves the historical Opus 4.7 fast-mode window', () => {
    const standardCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4.7',
      inputTokens: 1_000_000,
    })!;
    const historicalFastCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4.7',
      inputTokens: 1_000_000,
      isFastMode: true,
      timestampMs: Date.parse('2026-06-01T00:00:00Z'),
    })!;
    const removedFastCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4.7',
      inputTokens: 1_000_000,
      isFastMode: true,
      timestampMs: Date.parse('2026-07-24T00:00:00Z'),
    })!;
    expect(historicalFastCost).toBe(standardCost * 6);
    expect(removedFastCost).toBe(standardCost);
  });

  it('preserves the historical Opus 4.6 fast-mode window', () => {
    const standardCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6[1m]',
      inputTokens: 1_000_000,
    })!;
    const historicalFastCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6[1m]',
      inputTokens: 1_000_000,
      isFastMode: true,
      timestampMs: Date.parse('2026-03-01T00:00:00Z'),
    })!;
    const removedFastCost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-6[1m]',
      inputTokens: 1_000_000,
      isFastMode: true,
      timestampMs: Date.parse('2026-06-29T00:00:00Z'),
    })!;
    expect(historicalFastCost).toBe(standardCost * 6);
    expect(removedFastCost).toBe(standardCost);
  });

  it('prices Opus 4.8 fast mode at 2x from its launch', () => {
    expect(
      estimateCost({
        ...baseParams,
        model: 'claude-opus-4-8',
        inputTokens: 1_000_000,
        isFastMode: true,
        timestampMs: Date.parse('2026-05-28T00:00:00Z'),
      }),
    ).toBe(10);
  });

  it('does NOT apply fast mode multiplier for sonnet', () => {
    const standardCost = estimateCost({
      ...baseParams,
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
    })!;
    const fastCost = estimateCost({
      ...baseParams,
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
      isFastMode: true,
    })!;
    expect(fastCost).toBe(standardCost); // no multiplier
  });

  it('calculates sonnet pricing correctly', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-sonnet-4-6',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(3 + 15); // $3 input + $15 output
  });

  it('calculates haiku pricing correctly', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(1 + 5); // $1 input + $5 output
  });

  it('calculates opus 4.1 pricing correctly (legacy tier)', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-opus-4-1-20250527',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(15 + 75); // $15 input + $75 output
  });

  it('calculates haiku 3.5 pricing correctly', () => {
    const cost = estimateCost({
      ...baseParams,
      model: 'claude-3-5-haiku-20241022',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(0.8 + 4); // $0.80 input + $4 output
  });

  it('calculates mixed token types', () => {
    const cost = estimateCost({
      model: 'claude-opus-4-6',
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadInputTokens: 500_000,
      cacheWriteTokens: 200_000,
      isFastMode: false,
    });
    // 0.1M * $5 + 0.05M * $25 + 0.5M * $0.5 + 0.2M * $6.25
    expect(cost).toBeCloseTo(0.5 + 1.25 + 0.25 + 1.25, 6);
  });

  it.each([
    ['claude-opus-5', 3.675],
    ['claude-fable-5-1', 7.275],
    ['claude-sonnet-5', 1.47],
    ['gpt-6-astra', 7.35],
    ['gpt-5.6', 2.94],
    ['gpt-5.6-terra', 1.67],
    ['gpt-5.6-luna', 0.167],
  ])('calculates current pricing for %s', (model, expected) => {
    expect(
      estimateCost({
        ...baseParams,
        model,
        inputTokens: 100_000,
        outputTokens: 100_000,
        cacheReadInputTokens: 100_000,
        cacheWriteTokens: 100_000,
      }),
    ).toBeCloseTo(expected, 6);
  });

  it.each([
    ['gpt-5.6-terra', 2.0875, 1.67],
    ['gpt-5.6-luna', 0.835, 0.167],
  ])('uses timestamped pricing for %s across the July 30 cut', (model, before, after) => {
    const tokens = {
      ...baseParams,
      model,
      inputTokens: 100_000,
      outputTokens: 100_000,
      cacheReadInputTokens: 100_000,
      cacheWriteTokens: 100_000,
    };
    expect(
      estimateCost({ ...tokens, timestampMs: Date.parse('2026-07-29T23:59:59Z') }),
    ).toBeCloseTo(before, 6);
    expect(
      estimateCost({ ...tokens, timestampMs: Date.parse('2026-07-30T00:00:00Z') }),
    ).toBeCloseTo(after, 6);
  });

  it('enables 2x Sol Fast mode pricing at the July 30 boundary', () => {
    const tokens = {
      ...baseParams,
      model: 'gpt-5.6-sol',
      inputTokens: 100_000,
      outputTokens: 100_000,
      isFastMode: true,
    };
    expect(estimateCost({ ...tokens, timestampMs: Date.parse('2026-07-29T23:59:59Z') })).toBe(3.5);
    expect(estimateCost({ ...tokens, timestampMs: Date.parse('2026-07-30T00:00:00Z') })).toBe(7);
    expect(estimateCost({ ...tokens, timestampMs: Date.parse('2026-08-21T00:00:00Z') })).toBe(4.8);
  });

  it('keeps Sonnet 5 launch pricing after the cancelled September increase', () => {
    const tokens = {
      ...baseParams,
      model: 'claude-sonnet-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    expect(estimateCost({ ...tokens, timestampMs: Date.parse('2026-08-31T23:59:59Z') })).toBe(12);
    expect(estimateCost({ ...tokens, timestampMs: Date.parse('2026-09-01T00:00:00Z') })).toBe(12);
  });

  it('preserves Sol pricing before its August 21 promotion', () => {
    const tokens = {
      ...baseParams,
      model: 'gpt-5.6-sol',
      inputTokens: 100_000,
      outputTokens: 100_000,
      cacheReadInputTokens: 100_000,
      cacheWriteTokens: 100_000,
    };
    expect(
      estimateCost({ ...tokens, timestampMs: Date.parse('2026-08-20T23:59:59Z') }),
    ).toBeCloseTo(4.175, 6);
    expect(
      estimateCost({ ...tokens, timestampMs: Date.parse('2026-08-21T00:00:00Z') }),
    ).toBeCloseTo(2.94, 6);
  });

  it('applies OpenAI long-context pricing above 272K prompt tokens', () => {
    const atThreshold = estimateCost({
      ...baseParams,
      model: 'gpt-5.6',
      inputTokens: 272_000,
      outputTokens: 1_000_000,
    });
    const overThreshold = estimateCost({
      ...baseParams,
      model: 'gpt-5.6',
      inputTokens: 200_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 72_001,
      cacheWriteTokens: 100_000,
    });

    expect(atThreshold).toBeCloseTo(21.088, 6);
    expect(overThreshold).toBeCloseTo(32.6576008, 6);
  });

  it('does not apply long-context pricing to other OpenAI models', () => {
    expect(
      estimateCost({
        ...baseParams,
        model: 'gpt-5.4-mini',
        inputTokens: 273_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(4.70475, 6);
  });
});

describe('detectFastMode', () => {
  it('returns false for null headers', () => {
    expect(detectFastMode(null)).toBe(false);
  });

  it('returns false for empty headers', () => {
    expect(detectFastMode({})).toBe(false);
  });

  it('returns false when anthropic-beta has no fast-mode', () => {
    expect(detectFastMode({ 'anthropic-beta': 'some-other-beta' })).toBe(false);
  });

  it('returns true when anthropic-beta contains fast-mode', () => {
    expect(detectFastMode({ 'anthropic-beta': 'fast-mode' })).toBe(true);
  });

  it('returns true when fast-mode is part of comma-separated list', () => {
    expect(detectFastMode({ 'anthropic-beta': 'fast-mode-2025,something-else' })).toBe(true);
  });

  it('returns false for empty anthropic-beta', () => {
    expect(detectFastMode({ 'anthropic-beta': '' })).toBe(false);
  });
});

describe('detectOpenAIFastMode', () => {
  it.each(['fast', 'priority'])('recognizes service_tier=%s', (service_tier) => {
    expect(detectOpenAIFastMode({}, { service_tier })).toBe(true);
  });

  it.each(['default', 'flex', undefined])('rejects service_tier=%s', (service_tier) => {
    expect(detectOpenAIFastMode({}, { service_tier })).toBe(false);
  });
});

describe('computeCostBreakdown', () => {
  const baseRow = {
    model: 'claude-opus-4-6',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_write_tokens: 0,
    fast_input_tokens: 0,
    fast_output_tokens: 0,
    fast_cache_read_input_tokens: 0,
    fast_cache_write_tokens: 0,
    long_input_tokens: 0,
    long_output_tokens: 0,
    long_cache_read_input_tokens: 0,
    long_cache_write_tokens: 0,
  };

  it('returns all zeros for empty array', () => {
    const result = computeCostBreakdown([]);
    expect(result).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('computes cost for single model with normal tokens', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      },
    ]);
    expect(result.input).toBe(5); // $5 per 1M input
    expect(result.output).toBe(25); // $25 per 1M output
    expect(result.cacheRead).toBe(0);
    expect(result.cacheWrite).toBe(0);
  });

  it('applies 2x fast mode multiplier for Opus 5', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        model: 'claude-opus-5',
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        fast_input_tokens: 1_000_000,
        fast_output_tokens: 1_000_000,
      },
    ]);
    expect(result.input).toBe(10);
    expect(result.output).toBe(50);
  });

  it('applies long-context multipliers to each cost category', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        model: 'gpt-5.6',
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        cache_write_tokens: 1_000_000,
        long_input_tokens: 1_000_000,
        long_output_tokens: 1_000_000,
        long_cache_read_input_tokens: 1_000_000,
        long_cache_write_tokens: 1_000_000,
      },
    ]);

    expect(result).toEqual({ input: 8, output: 30, cacheRead: 0.8, cacheWrite: 10 });
  });

  it('skips unknown models', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        model: 'totally-unknown-model',
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      },
    ]);
    expect(result).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it('aggregates multiple models', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        model: 'claude-opus-4-6',
        input_tokens: 1_000_000,
      },
      {
        ...baseRow,
        model: 'claude-sonnet-4-6',
        input_tokens: 1_000_000,
      },
    ]);
    // Opus $5 + Sonnet $3 = $8
    expect(result.input).toBe(8);
  });

  it('computes cache costs correctly', () => {
    const result = computeCostBreakdown([
      {
        ...baseRow,
        cache_read_input_tokens: 1_000_000,
        cache_write_tokens: 1_000_000,
      },
    ]);
    expect(result.cacheRead).toBe(0.5); // $0.50 per 1M cache read
    expect(result.cacheWrite).toBe(6.25); // $6.25 per 1M cache create
  });
});

describe('sanitizeModel', () => {
  it.each([
    'Fable 5',
    'Fable-5',
    'fable 5',
    'fable-5',
    'claude-fabel-5',
    'claude-fable',
    'claude-fable-5 1m',
    'claude-fable-5-0',
    'claude-fable-5-1m',
    'claude-fable-5[1m]',
    'claude-fable-5-1',
    'claude-fable5',
    'claudefable-5',
    'claude-haiku-4-5',
    'claude-opus-4-0',
    'claude-opus-4-6[1m]',
    'claude-opus-4-7[1m]',
    'claude-opus-4-8[1m]',
    'claude-opus-4.7',
    'claude-opus-4.8',
    'claude-opus-48',
    'claude-opus-5',
    'claude-opus-5[1m]',
    'opus 5',
    'opus-5',
    'opus5',
    'opus-4-7',
    'claude-sonnet-4-0',
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5',
    'claude-sonnet-4-6[1m]',
    'claude-sonnet-5',
    'claude-sonnet-5[1m]',
    'sonnet 5',
    'sonnet-5',
    'sonnet5',
    'gpt-5.6',
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
  ])('preserves the known priced model %s', (model) => {
    expect(sanitizeModel(model)).toBe(model);
  });

  it('returns null for null input', () => {
    expect(sanitizeModel(null)).toBeNull();
  });

  it('returns known model unchanged', () => {
    expect(sanitizeModel('claude-opus-4-6')).toBe('claude-opus-4-6');
  });

  it('labels every unlisted model other, so names cannot be recovered or told apart', () => {
    expect(sanitizeModel('some-custom-model')).toBe('other');
    expect(sanitizeModel('model-a')).toBe(sanitizeModel('model-b'));
  });
});
