import { describe, expect, it } from 'vitest';

import type { InferenceData, TokenRevenuePricing } from './types';
import {
  applyTokenRevenuePricing,
  inputTokenShareForRevenue,
  NORMALIZED_TOKEN_REVENUE_PRICING,
  tokenRevenuePerGpuHour,
} from './token-revenue';

function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 20,
    y: 2_000,
    hwKey: 'b200',
    precision: 'fp8',
    tp: 8,
    conc: 16,
    date: '2026-08-27',
    tput_per_gpu: 2_000,
    input_tput_per_gpu: 1_600,
    output_tput_per_gpu: 400,
    tpPerGpu: { y: 2_000, roof: false },
    tpPerMw: { y: 1_000, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const openRouterPricing: TokenRevenuePricing = {
  source: 'openrouter',
  inputPerMillion: 2,
  outputPerMillion: 10,
  openRouterModelId: 'example/model',
};

describe('token revenue', () => {
  it('keeps the normalized $1/M axis equal to million total tokens per GPU hour', () => {
    expect(tokenRevenuePerGpuHour(point(), NORMALIZED_TOKEN_REVENUE_PRICING)).toBe(7.2);
  });

  it('prices compatible aggregate input and output rates separately', () => {
    const aggregate = point({
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 800,
      output_tput_per_gpu: 200,
    });
    expect(inputTokenShareForRevenue(aggregate)).toBe(0.8);
    expect(tokenRevenuePerGpuHour(aggregate, openRouterPricing)).toBeCloseTo(12.96, 10);
  });

  it('uses the structural sequence mix for disaggregated per-role rates', () => {
    const disaggregated = point({
      disagg: true,
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 1_600,
      output_tput_per_gpu: 200,
      isl: 8_192,
      osl: 1_024,
    });
    expect(inputTokenShareForRevenue(disaggregated)).toBeCloseTo(8 / 9, 10);
    expect(tokenRevenuePerGpuHour(disaggregated, openRouterPricing)).toBeCloseTo(10.4, 10);
  });

  it('uses measured prompt and generation totals for agentic disaggregated rows', () => {
    const agentic = point({
      disagg: true,
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 3_000,
      output_tput_per_gpu: 100,
      isl: null,
      osl: null,
      total_prompt_tokens: 1_300,
      total_generation_tokens: 10,
    });
    expect(inputTokenShareForRevenue(agentic)).toBeCloseTo(130 / 131, 10);
    expect(tokenRevenuePerGpuHour(agentic, openRouterPricing)).toBeCloseTo(
      (1_000 * 3_600 * ((130 / 131) * 2 + (1 / 131) * 10)) / 1_000_000,
      10,
    );
  });

  it('removes the normalized placeholder when OpenRouter pricing is unavailable', () => {
    const original = point({ tokenRevenuePerGpuHour: { y: 7.2, roof: false } });
    const [cleared] = applyTokenRevenuePricing([original], null);
    expect(cleared).not.toHaveProperty('tokenRevenuePerGpuHour');
    expect(original.tokenRevenuePerGpuHour).toEqual({ y: 7.2, roof: false });
  });

  it('does not invent OpenRouter revenue when the token mix is unavailable', () => {
    const unknownMix = point({
      input_tput_per_gpu: 0,
      output_tput_per_gpu: 0,
      isl: null,
      osl: null,
      total_prompt_tokens: undefined,
      total_generation_tokens: undefined,
    });

    expect(tokenRevenuePerGpuHour(unknownMix, openRouterPricing)).toBeNull();
  });
});
