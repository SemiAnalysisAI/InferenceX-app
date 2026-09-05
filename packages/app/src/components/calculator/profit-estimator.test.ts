import { describe, expect, it } from 'vitest';

import type { TokenRevenuePricing } from '@/components/inference/types';
import { Model } from '@/lib/data-mappings';

import {
  clampPercent,
  DEFAULT_LAB_CUT_PCT,
  DEFAULT_PROFIT_INTERACTIVITY,
  estimateProfitRows,
  estimateSkuProfit,
  formatProfitUsd,
  formatUsdCompact,
  formatUsdPerChipHour,
  gpuHoursPerGwYear,
  HOURS_PER_YEAR,
  isProfitEstimatorRow,
  listPricingToTokenRevenuePricing,
  modelsWithAgenticData,
  parseTokenPriceInput,
  profitModelDefaults,
  type ProfitEstimatorRow,
} from './profit-estimator';

/** $1/M tok on both streams: revenue collapses to total throughput. */
const FLAT_PRICING: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  cachedInputPerMillion: 0.1,
  outputPerMillion: 1,
};

/** Asymmetric prices need the measured input share to split the streams. */
const SPLIT_PRICING: TokenRevenuePricing = {
  source: 'openrouter',
  inputPerMillion: 0.5,
  cachedInputPerMillion: 0.05,
  outputPerMillion: 2,
  openRouterModelId: 'test/model',
};

// B200 figures from HW_REGISTRY: 1.71 kW all-in, $1.73/GPU/hr hyperscaler.
const B200 = { powerKwPerGpu: 1.71, costPerGpuHour: 1.73 };
const B200_GPU_HOURS = (1_000_000 / 1.71) * HOURS_PER_YEAR;

const result = {
  hwKey: 'b200',
  resultKey: 'b200',
  value: 1_000, // total tok/s/GPU -> $3.60/GPU/hr at $1/M flat
  inputTokenShare: 0.8,
  cacheHitRate: undefined,
};

function row(value: ReturnType<typeof estimateSkuProfit>): ProfitEstimatorRow {
  if (!isProfitEstimatorRow(value)) throw new Error(`expected a row, got skip: ${value.reason}`);
  return value;
}

describe('gpuHoursPerGwYear', () => {
  it('converts all-in kW per GPU into GPU-hours per GW-year', () => {
    expect(gpuHoursPerGwYear(1.71)).toBeCloseTo(B200_GPU_HOURS, 3);
    expect(gpuHoursPerGwYear(1)).toBe(1_000_000 * 8_760);
  });

  it('is null for a missing or zero power figure', () => {
    expect(gpuHoursPerGwYear(0)).toBeNull();
    expect(gpuHoursPerGwYear(Number.NaN)).toBeNull();
    expect(gpuHoursPerGwYear(-1)).toBeNull();
  });
});

describe('clampPercent', () => {
  it('clamps to [0, 100] and falls back on garbage', () => {
    expect(clampPercent(150, 60)).toBe(100);
    expect(clampPercent(-5, 60)).toBe(0);
    expect(clampPercent(42.5, 60)).toBe(42.5);
    expect(clampPercent(Number.NaN, 60)).toBe(60);
  });
});

describe('estimateSkuProfit', () => {
  it('stacks TCO, license fee and profit back up to revenue at 100% utilization', () => {
    const r = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 100,
        labCutPct: 30,
        basis: 'gw-year',
      }),
    );
    expect(r.revenuePerGpuHour).toBeCloseTo(3.6, 9);
    expect(r.revenue).toBeCloseTo(3.6 * B200_GPU_HOURS, 0);
    expect(r.tco).toBeCloseTo(1.73 * B200_GPU_HOURS, 0);
    expect(r.grossMargin).toBeCloseTo((3.6 - 1.73) * B200_GPU_HOURS, 0);
    expect(r.labCut).toBeCloseTo(0.3 * r.revenue, 3);
    expect(r.profit).toBeCloseTo(r.revenue - r.tco - r.labCut, 3);
    // The three segments are exactly the revenue bar.
    expect(r.tco + r.labCut + r.profit).toBeCloseTo(r.revenue, 3);
  });

  it('scales revenue by utilization and leaves TCO alone', () => {
    const full = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 100,
        labCutPct: 30,
        basis: 'gw-year',
      }),
    );
    const partial = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'gw-year',
      }),
    );
    expect(partial.revenue).toBeCloseTo(full.revenue * 0.6, 3);
    expect(partial.tco).toBeCloseTo(full.tco, 9);
    expect(partial.revenuePerGpuHour).toBe(full.revenuePerGpuHour);
    expect(partial.grossMargin).toBeCloseTo(partial.revenue - partial.tco, 3);
  });

  it('takes the license fee from revenue, not from gross margin', () => {
    const r = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'gw-year',
      }),
    );
    expect(r.labCut).toBeCloseTo(0.3 * r.revenue, 3);
    expect(r.labCut).not.toBeCloseTo(0.3 * (r.revenue - r.tco), 0);
  });

  it('still owes the license fee and reports a loss when compute exceeds revenue', () => {
    const cheap: TokenRevenuePricing = {
      ...FLAT_PRICING,
      inputPerMillion: 0.2,
      outputPerMillion: 0.2,
    };
    const r = row(
      estimateSkuProfit(result, B200, cheap, {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'gw-year',
      }),
    );
    // 1000 tok/s * 3600 / 1e6 * $0.2 = $0.72/GPU/hr, then 60% -> well below $1.73.
    expect(r.grossMargin).toBeLessThan(0);
    expect(r.labCut).toBeCloseTo(0.3 * r.revenue, 3);
    expect(r.profit).toBeCloseTo(r.grossMargin - r.labCut, 9);
    expect(r.profit).toBeLessThan(r.grossMargin);
  });

  it('honours a zero license fee and clamps out-of-range percentages', () => {
    const none = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 100,
        labCutPct: 0,
        basis: 'gw-year',
      }),
    );
    expect(none.labCut).toBe(0);
    expect(none.profit).toBeCloseTo(none.grossMargin, 9);

    const over = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, {
        utilizationPct: 250,
        labCutPct: 130,
        basis: 'gw-year',
      }),
    );
    expect(over.revenue).toBeCloseTo(3.6 * B200_GPU_HOURS, 0);
    expect(over.labCut).toBeCloseTo(over.revenue, 3);
    expect(over.profit).toBeCloseTo(-over.tco, 3);
  });

  it('prices input and output streams separately when the prices differ', () => {
    const r = row(
      estimateSkuProfit(result, B200, SPLIT_PRICING, {
        utilizationPct: 100,
        labCutPct: 0,
        basis: 'gw-year',
      }),
    );
    // 800 input tok/s at $0.5/M + 200 output tok/s at $2/M, per hour.
    const expected = ((800 * 0.5 + 200 * 2) * 3_600) / 1_000_000;
    expect(r.revenuePerGpuHour).toBeCloseTo(expected, 9);
  });

  it('skips a SKU whose price schedule needs a token mix it does not have', () => {
    const skip = estimateSkuProfit({ ...result, inputTokenShare: undefined }, B200, SPLIT_PRICING, {
      utilizationPct: 60,
      labCutPct: 30,
      basis: 'gw-year',
    });
    expect(isProfitEstimatorRow(skip)).toBe(false);
    if (!isProfitEstimatorRow(skip)) expect(skip.reason).toBe('no-token-mix');
  });

  it('skips a SKU with no power or no tier cost', () => {
    const noPower = estimateSkuProfit(
      result,
      { powerKwPerGpu: 0, costPerGpuHour: 1 },
      FLAT_PRICING,
      {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'gw-year',
      },
    );
    const noCost = estimateSkuProfit(
      result,
      { powerKwPerGpu: 1.5, costPerGpuHour: 0 },
      FLAT_PRICING,
      {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'gw-year',
      },
    );
    expect(isProfitEstimatorRow(noPower) ? null : noPower.reason).toBe('no-power');
    expect(isProfitEstimatorRow(noCost) ? null : noCost.reason).toBe('no-cost');
  });

  it('prices one chip-hour when the basis is chip-hour: GPU-hours = 1 and power is ignored', () => {
    const r = row(
      estimateSkuProfit(result, { powerKwPerGpu: 0, costPerGpuHour: 1.73 }, FLAT_PRICING, {
        utilizationPct: 60,
        labCutPct: 30,
        basis: 'chip-hour',
      }),
    );
    expect(r.gpuHours).toBe(1);
    expect(r.revenue).toBeCloseTo(3.6 * 0.6, 9);
    expect(r.tco).toBeCloseTo(1.73, 9);
    expect(r.labCut).toBeCloseTo(3.6 * 0.6 * 0.3, 9);
    expect(r.profit).toBeCloseTo(3.6 * 0.6 - 1.73 - 3.6 * 0.6 * 0.3, 9);
  });

  it('skips a config the target falls outside of instead of pricing its edge point', () => {
    const skipped = estimateSkuProfit({ ...result, clamped: true }, B200, FLAT_PRICING, {
      utilizationPct: 60,
      labCutPct: 30,
      basis: 'gw-year',
    });
    expect(isProfitEstimatorRow(skipped) ? null : skipped.reason).toBe('outside-measured-range');
  });
});

describe('estimateProfitRows', () => {
  it('splits priced rows from skipped SKUs and sorts by revenue descending', () => {
    const specs: Record<string, { powerKwPerGpu: number; costPerGpuHour: number }> = {
      b200: B200,
      h200: { powerKwPerGpu: 1.37, costPerGpuHour: 1.22 },
      ghost: { powerKwPerGpu: 0, costPerGpuHour: 1 },
    };
    const { rows, skipped } = estimateProfitRows(
      [
        { hwKey: 'h200', resultKey: 'h200', value: 400 },
        { hwKey: 'b200', resultKey: 'b200', value: 1_000 },
        { hwKey: 'ghost', resultKey: 'ghost', value: 5_000 },
      ],
      (hwKey) => specs[hwKey]!,
      FLAT_PRICING,
      { utilizationPct: 60, labCutPct: 30, basis: 'gw-year' },
    );
    expect(rows.map((r) => r.resultKey)).toEqual(['b200', 'h200']);
    expect(skipped).toEqual([
      { hwKey: 'ghost', resultKey: 'ghost', precision: undefined, reason: 'no-power' },
    ]);
  });
});

describe('formatProfitUsd', () => {
  it('uses fixed cents per chip-hour and compact units per GW-year', () => {
    expect(formatProfitUsd(2.3, 'chip-hour')).toBe('$2.30');
    expect(formatProfitUsd(-0.456, 'chip-hour')).toBe('-$0.46');
    expect(formatProfitUsd(2.3, 'chip-hour', 0)).toBe('$2.30');
    expect(formatProfitUsd(135.2e9, 'gw-year')).toBe('$135.2B');
    expect(formatProfitUsd(135.2e9, 'gw-year', 0)).toBe('$135B');
    expect(formatUsdPerChipHour(Number.NaN)).toBe('—');
  });
});

describe('formatUsdCompact', () => {
  it('picks a unit per magnitude and keeps the sign ahead of the currency', () => {
    expect(formatUsdCompact(12_345_678_901)).toBe('$12.3B');
    expect(formatUsdCompact(-2_500_000_000)).toBe('-$2.5B');
    expect(formatUsdCompact(4_200_000)).toBe('$4.2M');
    expect(formatUsdCompact(950_000)).toBe('$950.0k');
    expect(formatUsdCompact(12.34)).toBe('$12.3');
    expect(formatUsdCompact(Number.NaN)).toBe('—');
  });
});

const dbKeysFor = (model: string) => [model.toLowerCase()];
const aliasedDbKeys = (model: string) => (model === 'Kimi' ? ['kimi-k3', 'deepseek-v4-pro'] : []);

describe('modelsWithAgenticData', () => {
  const rows = [
    { model: 'deepseek-v4-pro', benchmark_type: 'agentic_traces' },
    { model: 'deepseek-v4-pro', benchmark_type: 'fixed' },
    { model: 'llama-3.3-70b', benchmark_type: 'fixed' },
  ];

  it('keeps only models with an agentic_traces row', () => {
    expect(modelsWithAgenticData(['DeepSeek-V4-Pro', 'Llama-3.3-70B'], rows, dbKeysFor)).toEqual([
      'DeepSeek-V4-Pro',
    ]);
  });

  it('matches through any of a model’s DB keys', () => {
    expect(modelsWithAgenticData(['Kimi'], rows, aliasedDbKeys)).toEqual(['Kimi']);
  });

  it('returns every model while availability has not loaded', () => {
    expect(modelsWithAgenticData(['A', 'B'], undefined, () => [])).toEqual(['A', 'B']);
  });
});

describe('parseTokenPriceInput', () => {
  it('accepts zero and positive decimals', () => {
    expect(parseTokenPriceInput('0')).toBe(0);
    expect(parseTokenPriceInput('0.066')).toBeCloseTo(0.066);
  });

  it('rejects empty, negative, and non-numeric input', () => {
    expect(parseTokenPriceInput('')).toBeNull();
    expect(parseTokenPriceInput('-1')).toBeNull();
    expect(parseTokenPriceInput('abc')).toBeNull();
  });
});

describe('profitModelDefaults', () => {
  it('opens Kimi K3 on 45 tok/s/user, the OpenRouter catalog, and a 30% license fee', () => {
    expect(profitModelDefaults(Model.Kimi_K3)).toEqual({
      interactivity: DEFAULT_PROFIT_INTERACTIVITY,
      listPricing: null,
      labCutPct: DEFAULT_LAB_CUT_PCT,
    });
  });

  it('opens GLM 5.2/5.3 on 100 tok/s/user and the Z.ai list price', () => {
    const defaults = profitModelDefaults(Model.GLM_5_2);
    expect(defaults.interactivity).toBe(100);
    expect(defaults.labCutPct).toBe(DEFAULT_LAB_CUT_PCT);
    expect(defaults.listPricing).toEqual({
      vendor: 'Z.ai',
      inputPerMillion: 1.4,
      cachedInputPerMillion: 0.26,
      outputPerMillion: 4.4,
      sourceUrl: 'https://docs.z.ai/guides/overview/pricing',
    });
  });

  it('opens MiniMax M3 on 83 tok/s/user, the MiniMax list price, and a 20% license fee', () => {
    const defaults = profitModelDefaults(Model.MiniMax_M3);
    expect(defaults.interactivity).toBe(83);
    expect(defaults.labCutPct).toBe(20);
    expect(defaults.listPricing).toEqual({
      vendor: 'MiniMax',
      inputPerMillion: 0.3,
      cachedInputPerMillion: 0.06,
      outputPerMillion: 1.2,
      sourceUrl: 'https://platform.minimax.io/docs/guides/pricing-paygo',
    });
    expect(listPricingToTokenRevenuePricing(defaults.listPricing!)).toEqual({
      source: 'normalized',
      inputPerMillion: 0.3,
      cachedInputPerMillion: 0.06,
      outputPerMillion: 1.2,
    });
  });

  it('opens DeepSeek V4 Pro on 24 tok/s/user, the DeepSeek peak list price, and a 30% license fee', () => {
    const defaults = profitModelDefaults(Model.DeepSeek_V4_Pro);
    expect(defaults.interactivity).toBe(24);
    expect(defaults.labCutPct).toBe(DEFAULT_LAB_CUT_PCT);
    expect(defaults.listPricing).toEqual({
      vendor: 'DeepSeek',
      inputPerMillion: 1.32,
      cachedInputPerMillion: 0.044,
      outputPerMillion: 3.96,
      sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    });
    expect(listPricingToTokenRevenuePricing(defaults.listPricing!)).toEqual({
      source: 'normalized',
      inputPerMillion: 1.32,
      cachedInputPerMillion: 0.044,
      outputPerMillion: 3.96,
    });
  });

  it('falls back to 45 tok/s/user, OpenRouter, and a 30% license fee for models without an entry', () => {
    expect(profitModelDefaults(Model.DeepSeek_R1)).toEqual({
      interactivity: DEFAULT_PROFIT_INTERACTIVITY,
      listPricing: null,
      labCutPct: DEFAULT_LAB_CUT_PCT,
    });
  });

  it('converts a list price into the normalized triple the revenue math takes', () => {
    const list = profitModelDefaults(Model.GLM_5_2).listPricing!;
    const pricing = listPricingToTokenRevenuePricing(list);
    expect(pricing).toEqual({
      source: 'normalized',
      inputPerMillion: 1.4,
      cachedInputPerMillion: 0.26,
      outputPerMillion: 4.4,
    });
    // The explicit cache price is honoured rather than the 10% default: a chip
    // producing 1M tokens per hour at a 50/50 input/output split with every
    // input token cached earns 0.5 x $0.26 + 0.5 x $4.40.
    const priced = row(
      estimateSkuProfit(
        {
          hwKey: 'b200',
          resultKey: 'b200_sglang',
          value: 1_000_000 / 3_600,
          inputTokenShare: 0.5,
          cacheHitRate: 1,
        },
        { powerKwPerGpu: 2, costPerGpuHour: 1 },
        pricing,
        { utilizationPct: 100, labCutPct: 0, basis: 'chip-hour' },
      ),
    );
    expect(priced.revenue).toBeCloseTo(0.5 * 0.26 + 0.5 * 4.4, 9);
  });
});
