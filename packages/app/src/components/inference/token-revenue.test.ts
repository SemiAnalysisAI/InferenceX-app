import { describe, expect, it } from 'vitest';

import type { InferenceData, TokenRevenuePricing } from './types';
import { METRIC_REGISTRY } from './metric-registry';
import {
  applyTokenRevenuePricing,
  cachedInputPricePerMillion,
  formatTokenPrice,
  gpuHoursPerMwYear,
  HOURS_PER_YEAR,
  inputTokenShareForRevenue,
  isTokenSalePricingMetric,
  NORMALIZED_TOKEN_REVENUE_PRICING,
  tokenProfitPerMwYear,
  tokenRevenuePerGpuHour,
  tokenRevenuePerMwYear,
  tokenRevenueFromRatesPerGpuHour,
  tokenSalePricingLabels,
  tokenSalePricingMetricFromRevenuePerGpuHour,
  usesTokenSalePricing,
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
  it('scopes the token price source to revenue and profit axes', () => {
    expect(usesTokenSalePricing('y_tokenRevenuePerGpuHour')).toBe(true);
    expect(usesTokenSalePricing('y_tokenRevenuePerMwYear')).toBe(true);
    expect(usesTokenSalePricing('y_tokenProfitPerMwYearH')).toBe(true);
    expect(usesTokenSalePricing('y_tokenProfitPerMwYearN')).toBe(true);
    expect(usesTokenSalePricing('y_tokenProfitPerMwYearR')).toBe(true);
    expect(usesTokenSalePricing('y_tokensPerDollarN')).toBe(false);
    expect(usesTokenSalePricing('y_outputTokensPerDollarH')).toBe(false);
    expect(usesTokenSalePricing('y_tpPerMw')).toBe(false);
    expect(isTokenSalePricingMetric('tokenProfitPerMwYearR')).toBe(true);
    expect(isTokenSalePricingMetric('costr')).toBe(false);
  });

  it('converts B200 all-in power into GPU-hours per MW-year', () => {
    // 1 MW / 1.71 kW per GPU = 584.8 GPUs, each running 8,760 hours.
    expect(gpuHoursPerMwYear('b200')).toBeCloseTo((1000 / 1.71) * HOURS_PER_YEAR, 6);
    expect(HOURS_PER_YEAR).toBe(8_760);
    expect(gpuHoursPerMwYear('not-a-gpu')).toBeNull();
  });

  it('scales $/GPU/hr revenue to $/MW/yr with the same pricing', () => {
    const revenue = tokenRevenuePerGpuHour(point(), NORMALIZED_TOKEN_REVENUE_PRICING)!;
    const gpuHours = gpuHoursPerMwYear('b200')!;
    expect(tokenRevenuePerMwYear(revenue, 'b200')).toBeCloseTo(7.2 * gpuHours, 6);
    expect(tokenRevenuePerMwYear(revenue, 'not-a-gpu')).toBeNull();
  });

  it('subtracts the selected TCO tier before scaling profit to a MW-year', () => {
    const gpuHours = gpuHoursPerMwYear('b200')!;
    // B200 TCO tiers: hyperscaler 1.73, Neocloud Giant 2.07, 3-year rental 2.6 $/GPU/hr.
    expect(tokenProfitPerMwYear(7.2, 'b200', 'costh')).toBeCloseTo((7.2 - 1.73) * gpuHours, 6);
    expect(tokenProfitPerMwYear(7.2, 'b200', 'costn')).toBeCloseTo((7.2 - 2.07) * gpuHours, 6);
    expect(tokenProfitPerMwYear(7.2, 'b200', 'costr')).toBeCloseTo((7.2 - 2.6) * gpuHours, 6);
    // Profit goes negative when sale prices sit below the hardware cost.
    expect(tokenProfitPerMwYear(1, 'b200', 'costr')).toBeLessThan(0);
    expect(tokenProfitPerMwYear(7.2, 'not-a-gpu', 'costh')).toBeNull();
  });

  it('derives every sale-priced axis from one $/GPU/hr revenue figure', () => {
    const gpuHours = gpuHoursPerMwYear('b200')!;
    expect(tokenSalePricingMetricFromRevenuePerGpuHour('tokenRevenuePerGpuHour', 7.2, 'b200')).toBe(
      7.2,
    );
    expect(
      tokenSalePricingMetricFromRevenuePerGpuHour('tokenRevenuePerMwYear', 7.2, 'b200'),
    ).toBeCloseTo(7.2 * gpuHours, 6);
    expect(
      tokenSalePricingMetricFromRevenuePerGpuHour('tokenProfitPerMwYearN', 7.2, 'b200'),
    ).toBeCloseTo((7.2 - 2.07) * gpuHours, 6);
  });

  it('applies pricing to the revenue and profit MW-year axes together', () => {
    const [priced] = applyTokenRevenuePricing([point()], openRouterPricing);
    const revenue = tokenRevenuePerGpuHour(point(), openRouterPricing)!;
    const gpuHours = gpuHoursPerMwYear('b200')!;
    expect(priced.tokenRevenuePerGpuHour?.y).toBeCloseTo(revenue, 6);
    expect(priced.tokenRevenuePerMwYear?.y).toBeCloseTo(revenue * gpuHours, 6);
    expect(priced.tokenProfitPerMwYearH?.y).toBeCloseTo((revenue - 1.73) * gpuHours, 6);
    expect(priced.tokenProfitPerMwYearN?.y).toBeCloseTo((revenue - 2.07) * gpuHours, 6);
    expect(priced.tokenProfitPerMwYearR?.y).toBeCloseTo((revenue - 2.6) * gpuHours, 6);
  });

  it('names the price source in revenue and profit axis copy', () => {
    const revenue = tokenSalePricingLabels(METRIC_REGISTRY.tokenRevenuePerGpuHour, 'openrouter');
    expect(revenue.label).toBe('Token Revenue per GPU Hour at OpenRouter Pricing ($/GPU/hr)');
    expect(revenue.labelZh).toBe('按 OpenRouter 价格计算的每 GPU 小时 token 收入（$/GPU/hr）');
    expect(revenue.title).toBe('Token Revenue per GPU Hour at OpenRouter Pricing');
    expect(revenue.titleZh).toBe('按 OpenRouter 价格计算的每 GPU 小时 token 收入');

    const normalized = tokenSalePricingLabels(METRIC_REGISTRY.tokenRevenuePerGpuHour, 'normalized');
    expect(normalized.label).toBe('Token Revenue per GPU Hour at Normalized Pricing ($/GPU/hr)');
    expect(normalized.titleZh).toBe('按标准化价格计算的每 GPU 小时 token 收入');

    const profit = tokenSalePricingLabels(METRIC_REGISTRY.tokenProfitPerMwYearR, 'openrouter');
    expect(profit.label).toBe(
      'Token Profit per All in Utility MW per Year at OpenRouter Pricing ($/MW/yr)',
    );
    expect(profit.title).toBe(
      'Token Profit per All in Utility MW per Year at OpenRouter Pricing (3 Year Rental)',
    );
  });

  it('formats subtitle prices without unnecessary trailing zeroes', () => {
    expect(formatTokenPrice(1)).toBe('1');
    expect(formatTokenPrice(1.122)).toBe('1.122');
    expect(formatTokenPrice(0.000001)).toBe('0.000001');
  });

  it('keeps the normalized $1/M axis equal to million total tokens per GPU hour', () => {
    expect(tokenRevenuePerGpuHour(point(), NORMALIZED_TOKEN_REVENUE_PRICING)).toBe(7.2);
  });

  it('prices measured Agentic cache hits at the separate cached-input price', () => {
    const agentic = point({
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 800,
      output_tput_per_gpu: 200,
      server_gpu_cache_hit_rate: 0.8,
      server_external_cache_hit_rate: 0.1,
      // External already contains this offload tier, so it must not be added.
      server_cpu_cache_hit_rate: 0.05,
    });
    const pricing: TokenRevenuePricing = {
      source: 'openrouter',
      inputPerMillion: 2,
      cachedInputPerMillion: 0.2,
      outputPerMillion: 10,
    };

    // 80 fresh input tok/s at $2/M, 720 cached at $0.2/M, 200 output at $10/M.
    expect(tokenRevenuePerGpuHour(agentic, pricing)).toBeCloseTo(8.2944, 10);
  });

  it('applies cache pricing to the normalized source too', () => {
    const agentic = point({
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 800,
      output_tput_per_gpu: 200,
      server_gpu_cache_hit_rate: 0.9,
    });

    expect(tokenRevenuePerGpuHour(agentic, NORMALIZED_TOKEN_REVENUE_PRICING)).toBeCloseTo(
      1.2672,
      10,
    );
  });

  it('falls back to 10% of fresh-input price when no cached price is supplied', () => {
    expect(cachedInputPricePerMillion(openRouterPricing)).toBe(0.2);
  });

  it('prices pre-interpolated throughput, token share, and cache hit', () => {
    expect(
      tokenRevenueFromRatesPerGpuHour(1_000, 0.8, 0.9, {
        source: 'openrouter',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 10,
      }),
    ).toBeCloseTo(8.2944, 10);
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

  it('rejects incomplete fixed-sequence token mixes', () => {
    const partialSequence = point({
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 1_600,
      output_tput_per_gpu: 200,
      isl: 8_192,
      osl: null,
      total_prompt_tokens: undefined,
      total_generation_tokens: undefined,
    });

    expect(inputTokenShareForRevenue(partialSequence)).toBeNull();
    expect(tokenRevenuePerGpuHour(partialSequence, openRouterPricing)).toBeNull();
  });

  it('rejects incomplete agentic token mixes', () => {
    const partialAgentic = point({
      tput_per_gpu: 1_000,
      input_tput_per_gpu: 3_000,
      output_tput_per_gpu: 100,
      isl: null,
      osl: null,
      total_prompt_tokens: 1_300,
      total_generation_tokens: undefined,
    });

    expect(inputTokenShareForRevenue(partialAgentic)).toBeNull();
    expect(tokenRevenuePerGpuHour(partialAgentic, openRouterPricing)).toBeNull();
  });

  it('removes the normalized placeholder when OpenRouter pricing is unavailable', () => {
    const original = point({
      tokenRevenuePerGpuHour: { y: 7.2, roof: false },
      tokensPerDollarN: { y: 2_000_000, roof: false },
    });
    const [cleared] = applyTokenRevenuePricing([original], null);
    expect(cleared).not.toHaveProperty('tokenRevenuePerGpuHour');
    expect(cleared).not.toHaveProperty('tokenRevenuePerMwYear');
    expect(cleared).not.toHaveProperty('tokenProfitPerMwYearH');
    expect(cleared.tokensPerDollarN).toEqual({ y: 2_000_000, roof: false });
    expect(original.tokenRevenuePerGpuHour).toEqual({ y: 7.2, roof: false });
    expect(original.tokensPerDollarN).toEqual({ y: 2_000_000, roof: false });
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
