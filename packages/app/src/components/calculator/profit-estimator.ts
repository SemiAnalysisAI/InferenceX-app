/**
 * Profit Estimator — per-GW-year economics for one hardware SKU at a chosen
 * interactivity operating point.
 *
 * Every figure is normalised to one all-in utility gigawatt-year so SKUs with
 * very different per-chip power draw compare on the same denominator:
 *
 *   GPU-hours per GW-year = (1,000,000 kW / all-in kW per GPU) x 8,760 h
 *   Revenue               = $/GPU/hr sale revenue x GPU-hours x utilization
 *   Compute expense (TCO) = tier $/GPU/hr x GPU-hours
 *   Gross margin          = Revenue - TCO
 *   Lab cut               = max(0, gross margin) x lab cut share
 *   Profit                = Gross margin - lab cut
 *
 * Utilization scales revenue only. The fleet is paid for whether or not it is
 * busy, so TCO is unchanged; a 60% utilization simply sells 60% of the tokens
 * the benchmark says the chips can produce. The lab cut is a share of the
 * gross margin (what is left after compute), never of revenue, and it is zero
 * when the margin is negative — a lab does not fund a loss-making deployment.
 */

import { tokenRevenueFromRatesPerGpuHour } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';

import type { InterpolatedResult } from './types';

/** Calendar hours in a year (365 x 24). */
export const HOURS_PER_YEAR = 8_760;
const KW_PER_GW = 1_000_000;

export const DEFAULT_PROFIT_INTERACTIVITY = 45;
/** Fraction of benchmarked throughput that is actually sold. */
export const DEFAULT_UTILIZATION_PCT = 60;
/** Share of gross margin paid to the model lab. */
export const DEFAULT_LAB_CUT_PCT = 30;

export interface ProfitEstimatorAssumptions {
  /** 0–100. Revenue is scaled by this share; TCO is not. */
  utilizationPct: number;
  /** 0–100. Applied to positive gross margin only. */
  labCutPct: number;
}

export interface ProfitEstimatorRow {
  hwKey: string;
  resultKey: string;
  precision?: string;
  /** GPU-hours one all-in utility GW buys in a year for this SKU. */
  gpuHoursPerGwYear: number;
  /** Gross $/GPU/hr at 100% utilization, before any haircut. */
  revenuePerGpuHour: number;
  /** $/GW/yr after utilization. */
  revenue: number;
  /** $/GW/yr compute expense at the chosen cost tier. */
  tco: number;
  /** $/GW/yr revenue minus TCO. Negative when the sale price does not cover compute. */
  grossMargin: number;
  /** $/GW/yr paid to the model lab. Zero when gross margin is not positive. */
  labCut: number;
  /** $/GW/yr left to the operator after compute and the lab cut. */
  profit: number;
  /** Interpolation edge flags carried over from the operating-point solve. */
  clamped?: boolean;
  clampedAbove?: boolean;
}

/** Why a SKU has no bar even though it is in the legend. */
export type ProfitEstimatorSkipReason = 'no-power' | 'no-cost' | 'no-token-mix';

export interface ProfitEstimatorSkipped {
  hwKey: string;
  resultKey: string;
  precision?: string;
  reason: ProfitEstimatorSkipReason;
}

export interface ProfitEstimatorOutput {
  rows: ProfitEstimatorRow[];
  skipped: ProfitEstimatorSkipped[];
}

/** Clamp a percentage input to [0, 100]; anything unparseable becomes the fallback. */
export function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

/**
 * GPU-hours one all-in utility gigawatt buys in a year. Null when the SKU has
 * no power figure so callers never divide by zero.
 */
export function gpuHoursPerGwYear(powerKwPerGpu: number): number | null {
  if (!(powerKwPerGpu > 0)) return null;
  return (KW_PER_GW / powerKwPerGpu) * HOURS_PER_YEAR;
}

export interface ProfitEstimatorSpecs {
  /** All-in kW per GPU (chip plus its share of node, network, cooling). */
  powerKwPerGpu: number;
  /** Tier $/GPU/hr from the SemiAnalysis AI Cloud TCO Model. */
  costPerGpuHour: number;
}

/**
 * Economics of one SKU at one operating point. Returns a skip reason instead of
 * a row when the SKU cannot be priced: no power figure, no tier cost, or a
 * price schedule that needs an input/output mix the benchmark did not record.
 */
export function estimateSkuProfit(
  result: Pick<
    InterpolatedResult,
    'hwKey' | 'resultKey' | 'precision' | 'value' | 'inputTokenShare' | 'cacheHitRate' | 'clamped'
  > &
    Partial<Pick<InterpolatedResult, 'clampedAbove'>>,
  specs: ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
): ProfitEstimatorRow | ProfitEstimatorSkipped {
  const base = { hwKey: result.hwKey, resultKey: result.resultKey, precision: result.precision };
  const gpuHours = gpuHoursPerGwYear(specs.powerKwPerGpu);
  if (gpuHours === null) return { ...base, reason: 'no-power' };
  if (!(specs.costPerGpuHour > 0)) return { ...base, reason: 'no-cost' };

  const revenuePerGpuHour = tokenRevenueFromRatesPerGpuHour(
    result.value,
    result.inputTokenShare ?? null,
    result.cacheHitRate ?? null,
    pricing,
  );
  if (revenuePerGpuHour === null) return { ...base, reason: 'no-token-mix' };

  const utilization = clampPercent(assumptions.utilizationPct, DEFAULT_UTILIZATION_PCT) / 100;
  const labShare = clampPercent(assumptions.labCutPct, DEFAULT_LAB_CUT_PCT) / 100;

  const revenue = revenuePerGpuHour * gpuHours * utilization;
  const tco = specs.costPerGpuHour * gpuHours;
  const grossMargin = revenue - tco;
  const labCut = Math.max(0, grossMargin) * labShare;
  const profit = grossMargin - labCut;

  return {
    ...base,
    gpuHoursPerGwYear: gpuHours,
    revenuePerGpuHour,
    revenue,
    tco,
    grossMargin,
    labCut,
    profit,
    clamped: result.clamped,
    clampedAbove: result.clampedAbove,
  };
}

export function isProfitEstimatorRow(
  value: ProfitEstimatorRow | ProfitEstimatorSkipped,
): value is ProfitEstimatorRow {
  return 'revenue' in value;
}

/**
 * Estimate every interpolated SKU, splitting priced rows from the ones that
 * had to be skipped. Rows come back sorted by revenue descending so the chart
 * reads left to right from the largest top line.
 */
export function estimateProfitRows(
  results: readonly Parameters<typeof estimateSkuProfit>[0][],
  specsFor: (hwKey: string) => ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
): ProfitEstimatorOutput {
  const rows: ProfitEstimatorRow[] = [];
  const skipped: ProfitEstimatorSkipped[] = [];
  for (const result of results) {
    const estimate = estimateSkuProfit(result, specsFor(result.hwKey), pricing, assumptions);
    if (isProfitEstimatorRow(estimate)) rows.push(estimate);
    else skipped.push(estimate);
  }
  rows.sort((a, b) => b.revenue - a.revenue || a.resultKey.localeCompare(b.resultKey));
  return { rows, skipped };
}

/**
 * Format a $/GW/yr figure. These run to tens of billions, so the unit is
 * chosen per value and negatives keep their sign in front of the currency.
 */
export function formatUsdCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(digits)}k`;
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : digits)}`;
}
