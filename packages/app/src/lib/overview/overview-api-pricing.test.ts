import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';

import {
  OVERVIEW_TOKEN_MIXES,
  overviewApiPrice,
  overviewApiRatio,
  overviewTokenMixKey,
  tokenMixShares,
  totalTokens,
} from './overview-api-pricing';

describe('overview API pricing', () => {
  it('routes 256K-capped models to the filtered AgentX corpus', () => {
    expect(overviewTokenMixKey(Model.Qwen3_5, 'agentx')).toBe('agentx_256k');
    expect(overviewTokenMixKey(Model.Kimi_K3_1_Pro, 'agentx')).toBe('agentx_full');
    expect(overviewTokenMixKey(Model.Qwen3_5, 'single_turn_8k1k')).toBe('single_turn_8k1k');
  });

  it('token-mix shares sum to one', () => {
    for (const mix of Object.values(OVERVIEW_TOKEN_MIXES)) {
      const s = tokenMixShares(mix);
      expect(s.cachedTokens + s.uncachedInputTokens + s.outputTokens).toBeCloseTo(1, 12);
    }
  });

  it('applies the AgentX cache / input / output mix to a flat price', () => {
    const read = overviewApiPrice(Model.Kimi_K3_1_Pro, 'agentx');
    expect(read.status).toBe('priced');
    if (read.status !== 'priced') return;
    const s = tokenMixShares(OVERVIEW_TOKEN_MIXES.agentx_full);
    const expected = s.cachedTokens * 0.2 + s.uncachedInputTokens * 2 + s.outputTokens * 10;
    expect(read.costPerMtok).toBeCloseTo(expected, 10);
    expect(read.costPerMtok).toBeCloseTo(0.2835, 4);
  });

  it('bills no-cache APIs at the input price for cached corpus tokens', () => {
    const read = overviewApiPrice(Model.Qwen3_5, 'single_turn_8k1k');
    if (read.status !== 'priced') throw new Error('expected a price');
    // 8,192 input + 1,024 output tokens, all in the ≤128K tier.
    expect(read.costPerMtok).toBeCloseTo((8192 * 0.172 + 1024 * 1.032) / 9216, 10);
  });

  it('splits a tiered price by measured per-request input length', () => {
    const read = overviewApiPrice(Model.Qwen3_5, 'agentx');
    if (read.status !== 'priced') throw new Error('expected a price');
    const total = totalTokens(OVERVIEW_TOKEN_MIXES.agentx_256k);
    const lowerBound = (total - OVERVIEW_TOKEN_MIXES.agentx_256k.outputTokens) * 0.172;
    expect(read.costPerMtok * total).toBeGreaterThan(lowerBound);
    expect(read.costPerMtok).toBeCloseTo(0.3339, 4);
  });

  it('never estimates a model without a first-party price', () => {
    expect(overviewApiPrice(Model.Llama3_3_70B, 'single_turn_8k1k')).toEqual({
      status: 'unavailable',
      reason: 'no_official_api',
    });
  });

  it('ratio is API ÷ hardware and null when either side is missing', () => {
    expect(overviewApiRatio(0.1, 0.5)).toBeCloseTo(5, 10);
    expect(overviewApiRatio(null, 0.5)).toBeNull();
    expect(overviewApiRatio(0.1, null)).toBeNull();
    expect(overviewApiRatio(0, 0.5)).toBeNull();
  });
});
