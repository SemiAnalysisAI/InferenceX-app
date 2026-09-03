import { describe, expect, it } from 'vitest';

import type { TokenRevenuePricing } from '@/components/inference/types';

import {
  clampPercent,
  estimateProfitRows,
  estimateSkuProfit,
  formatUsdCompact,
  gpuHoursPerGwYear,
  HOURS_PER_YEAR,
  isProfitEstimatorRow,
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
  it('stacks TCO, lab cut and profit back up to revenue at 100% utilization', () => {
    const r = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 100, labCutPct: 30 }),
    );
    expect(r.revenuePerGpuHour).toBeCloseTo(3.6, 9);
    expect(r.revenue).toBeCloseTo(3.6 * B200_GPU_HOURS, 0);
    expect(r.tco).toBeCloseTo(1.73 * B200_GPU_HOURS, 0);
    expect(r.grossMargin).toBeCloseTo((3.6 - 1.73) * B200_GPU_HOURS, 0);
    expect(r.labCut).toBeCloseTo(0.3 * r.grossMargin, 3);
    expect(r.profit).toBeCloseTo(0.7 * r.grossMargin, 3);
    // The three segments are exactly the revenue bar.
    expect(r.tco + r.labCut + r.profit).toBeCloseTo(r.revenue, 3);
  });

  it('scales revenue by utilization and leaves TCO alone', () => {
    const full = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 100, labCutPct: 30 }),
    );
    const partial = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 60, labCutPct: 30 }),
    );
    expect(partial.revenue).toBeCloseTo(full.revenue * 0.6, 3);
    expect(partial.tco).toBeCloseTo(full.tco, 9);
    expect(partial.revenuePerGpuHour).toBe(full.revenuePerGpuHour);
    expect(partial.grossMargin).toBeCloseTo(partial.revenue - partial.tco, 3);
  });

  it('takes the lab cut from gross margin, not from revenue', () => {
    const r = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 60, labCutPct: 30 }),
    );
    expect(r.labCut).toBeCloseTo(0.3 * (r.revenue - r.tco), 3);
    expect(r.labCut).not.toBeCloseTo(0.3 * r.revenue, 0);
  });

  it('zeroes the lab cut and reports a loss when the margin is negative', () => {
    const cheap: TokenRevenuePricing = {
      ...FLAT_PRICING,
      inputPerMillion: 0.2,
      outputPerMillion: 0.2,
    };
    const r = row(estimateSkuProfit(result, B200, cheap, { utilizationPct: 60, labCutPct: 30 }));
    // 1000 tok/s * 3600 / 1e6 * $0.2 = $0.72/GPU/hr, then 60% -> well below $1.73.
    expect(r.grossMargin).toBeLessThan(0);
    expect(r.labCut).toBe(0);
    expect(r.profit).toBeCloseTo(r.grossMargin, 9);
    expect(r.tco + r.profit).toBeCloseTo(r.revenue, 3);
  });

  it('honours a zero lab cut and clamps out-of-range percentages', () => {
    const none = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 100, labCutPct: 0 }),
    );
    expect(none.labCut).toBe(0);
    expect(none.profit).toBeCloseTo(none.grossMargin, 9);

    const over = row(
      estimateSkuProfit(result, B200, FLAT_PRICING, { utilizationPct: 250, labCutPct: 130 }),
    );
    expect(over.revenue).toBeCloseTo(3.6 * B200_GPU_HOURS, 0);
    expect(over.labCut).toBeCloseTo(over.grossMargin, 3);
    expect(over.profit).toBeCloseTo(0, 6);
  });

  it('prices input and output streams separately when the prices differ', () => {
    const r = row(
      estimateSkuProfit(result, B200, SPLIT_PRICING, { utilizationPct: 100, labCutPct: 0 }),
    );
    // 800 input tok/s at $0.5/M + 200 output tok/s at $2/M, per hour.
    const expected = ((800 * 0.5 + 200 * 2) * 3_600) / 1_000_000;
    expect(r.revenuePerGpuHour).toBeCloseTo(expected, 9);
  });

  it('skips a SKU whose price schedule needs a token mix it does not have', () => {
    const skip = estimateSkuProfit({ ...result, inputTokenShare: undefined }, B200, SPLIT_PRICING, {
      utilizationPct: 60,
      labCutPct: 30,
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
      },
    );
    const noCost = estimateSkuProfit(
      result,
      { powerKwPerGpu: 1.5, costPerGpuHour: 0 },
      FLAT_PRICING,
      {
        utilizationPct: 60,
        labCutPct: 30,
      },
    );
    expect(isProfitEstimatorRow(noPower) ? null : noPower.reason).toBe('no-power');
    expect(isProfitEstimatorRow(noCost) ? null : noCost.reason).toBe('no-cost');
  });

  it('carries the interpolation edge flags through', () => {
    const r = row(
      estimateSkuProfit({ ...result, clamped: true, clampedAbove: true }, B200, FLAT_PRICING, {
        utilizationPct: 60,
        labCutPct: 30,
      }),
    );
    expect(r.clamped).toBe(true);
    expect(r.clampedAbove).toBe(true);
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
      { utilizationPct: 60, labCutPct: 30 },
    );
    expect(rows.map((r) => r.resultKey)).toEqual(['b200', 'h200']);
    expect(skipped).toEqual([
      { hwKey: 'ghost', resultKey: 'ghost', precision: undefined, reason: 'no-power' },
    ]);
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
