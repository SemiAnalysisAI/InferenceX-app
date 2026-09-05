/**
 * Profit Estimator — economics of one hardware SKU at a chosen interactivity
 * operating point, on one of two denominators (`ProfitBasis`):
 *
 *   chip-hour  one GPU for one hour (GPU-hours = 1), the raw $/GPU/hr view
 *   gw-year    one all-in utility gigawatt-year, so SKUs with very different
 *              per-chip power draw compare on the same denominator:
 *              GPU-hours = (1,000,000 kW / all-in kW per GPU) x 8,760 h
 *
 *   Revenue               = $/GPU/hr sale revenue x GPU-hours x utilization
 *   Compute expense (TCO) = tier $/GPU/hr x GPU-hours
 *   Gross margin          = Revenue - TCO
 *   Model license fee     = Revenue x license fee share
 *   Profit                = Revenue - TCO - license fee
 *
 * Utilization scales revenue only. The fleet is paid for whether or not it is
 * busy, so TCO is unchanged; a 60% utilization simply sells 60% of the tokens
 * the benchmark says the chips can produce. The license fee is a revenue share (a
 * royalty on every token sold), so it is owed even when compute alone already
 * eats the revenue; the operator's profit can therefore go negative.
 */

import { tokenRevenueFromRatesPerGpuHour } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { Model } from '@/lib/data-mappings';

import type { InterpolatedResult } from './types';

/** Calendar hours in a year (365 x 24). */
export const HOURS_PER_YEAR = 8_760;
const KW_PER_GW = 1_000_000;

export const DEFAULT_PROFIT_INTERACTIVITY = 45;
/** Share of revenue paid to the model lab. */
export const DEFAULT_LAB_CUT_PCT = 30;

/**
 * A lab's published API price, offered as a Token Price source next to the
 * OpenRouter catalog. Useful where third-party hosts undercut the lab and the
 * catalog aggregate would understate what the lab itself charges.
 */
export interface ProfitListPricing {
  /** Who publishes the price, e.g. `Z.ai`; shown in the selector and caption. */
  vendor: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  /** Public pricing page the figures were read from. */
  sourceUrl: string;
}

/** Operating point and price source each model opens on. */
export interface ProfitModelDefaults {
  /** Interactivity target (tok/s/user) the page opens on for this model. */
  interactivity: number;
  /** Lab list price; when present the page opens on it instead of OpenRouter. */
  listPricing: ProfitListPricing | null;
  /** Model license fee (% of revenue) the page opens on for this model. */
  labCutPct: number;
}

/**
 * Per-model defaults. Kimi K3 opens on 45 tok/s/user and OpenRouter, where
 * Moonshot's price holds across hosts. GLM 5.2/5.3 opens on Z.ai's list price
 * ($1.40 / $0.26 cached / $4.40 per M tok) because third-party hosts undercut
 * it on OpenRouter, and on 100 tok/s/user: Z.ai serves at 48 tok/s/user, but
 * no priced SKU has a measured point that low yet, so the nearest round
 * operating point every curve covers is used until one does. MiniMax M3 opens
 * on MiniMax's standard list price for <=512K-token calls ($0.30 / $0.06
 * cached / $1.20 per M tok, the permanent 50%-off rate) because the OpenRouter
 * aggregate also sits below it, and on 83 tok/s/user, the speed MiniMax's own
 * API serves at; the B200/B300/GB200/MI355X agentic curves all cover that
 * point, and the Hopper and MI300-series curves top out below it and list as
 * not priced. GLM 5.2/5.3 opens on a 10% model license fee and MiniMax M3 on
 * 20%, instead of the 30% the other models assume.
 */
const PROFIT_MODEL_DEFAULTS: Partial<Record<Model, ProfitModelDefaults>> = {
  [Model.Kimi_K3]: {
    interactivity: DEFAULT_PROFIT_INTERACTIVITY,
    listPricing: null,
    labCutPct: DEFAULT_LAB_CUT_PCT,
  },
  [Model.GLM_5_2]: {
    interactivity: 100,
    labCutPct: 10,
    listPricing: {
      vendor: 'Z.ai',
      inputPerMillion: 1.4,
      cachedInputPerMillion: 0.26,
      outputPerMillion: 4.4,
      sourceUrl: 'https://docs.z.ai/guides/overview/pricing',
    },
  },
  [Model.MiniMax_M3]: {
    interactivity: 83,
    labCutPct: 20,
    listPricing: {
      vendor: 'MiniMax',
      inputPerMillion: 0.3,
      cachedInputPerMillion: 0.06,
      outputPerMillion: 1.2,
      sourceUrl: 'https://platform.minimax.io/docs/guides/pricing-paygo',
    },
  },
};

const FALLBACK_MODEL_DEFAULTS: ProfitModelDefaults = {
  interactivity: DEFAULT_PROFIT_INTERACTIVITY,
  listPricing: null,
  labCutPct: DEFAULT_LAB_CUT_PCT,
};

/** Defaults for `model`; models without an entry get 45 tok/s/user, OpenRouter, and a 30% license fee. */
export function profitModelDefaults(model: Model): ProfitModelDefaults {
  return PROFIT_MODEL_DEFAULTS[model] ?? FALLBACK_MODEL_DEFAULTS;
}

/** The list price as a normalized pricing triple the revenue math accepts. */
export function listPricingToTokenRevenuePricing(list: ProfitListPricing): TokenRevenuePricing {
  return {
    source: 'normalized',
    inputPerMillion: list.inputPerMillion,
    cachedInputPerMillion: list.cachedInputPerMillion,
    outputPerMillion: list.outputPerMillion,
  };
}

/** Fraction of benchmarked throughput that is actually sold. */
export const DEFAULT_UTILIZATION_PCT = 60;

/**
 * Denominator every figure is expressed in. `/profit-estimator` is per chip-hour;
 * `/profit-estimator-per-gigawatt` scales by the GPU-hours one GW-year buys.
 */
export type ProfitBasis = 'chip-hour' | 'gw-year';

export interface ProfitEstimatorAssumptions {
  /** 0–100. Revenue is scaled by this share; TCO is not. */
  utilizationPct: number;
  /** 0–100. Share of revenue paid to the model lab. */
  labCutPct: number;
  basis: ProfitBasis;
}

export interface ProfitEstimatorRow {
  hwKey: string;
  resultKey: string;
  precision?: string;
  /**
   * Comparison entry the SKU was priced on (a run date, or `date~r<runId>` for
   * one specific run), set only for compare-history bars. Today's bars carry
   * no date: the run date above the chart describes them.
   */
  date?: string;
  /**
   * Human label for `date` (e.g. `2026-06-14 #2` for the second run that day),
   * as the changelog shows it. Falls back to `date` when unset.
   */
  dateLabel?: string;
  /** GPU-hours in the denominator: 1 per chip-hour, or what one GW-year buys for this SKU. */
  gpuHours: number;
  /** Gross $/GPU/hr at 100% utilization, before any haircut. */
  revenuePerGpuHour: number;
  /** $ per basis after utilization. */
  revenue: number;
  /** $ per basis compute expense at the chosen cost tier. */
  tco: number;
  /** $ per basis revenue minus TCO. Negative when the sale price does not cover compute. */
  grossMargin: number;
  /** $ per basis paid to the model lab as a share of revenue. */
  labCut: number;
  /** $ per basis left to the operator after compute and the license fee. */
  profit: number;
}

/**
 * Why a SKU has no bar. `outside-measured-range` is the common one: the
 * config was never benchmarked at the target interactivity, so its nearest
 * edge point would be a guess, not a read, and the fleet page excludes those
 * for the same reason.
 */
export type ProfitEstimatorSkipReason =
  | 'outside-measured-range'
  | 'no-power'
  | 'no-cost'
  | 'no-token-mix';

export interface ProfitEstimatorSkipped {
  hwKey: string;
  resultKey: string;
  precision?: string;
  date?: string;
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
 * a row when the SKU cannot be priced: the target sits outside the measured
 * interactivity range, no power figure, no tier cost, or a price schedule that
 * needs an input/output mix the benchmark did not record.
 */
export function estimateSkuProfit(
  result: Pick<
    InterpolatedResult,
    'hwKey' | 'resultKey' | 'precision' | 'value' | 'inputTokenShare' | 'cacheHitRate' | 'clamped'
  > & { date?: string },
  specs: ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
): ProfitEstimatorRow | ProfitEstimatorSkipped {
  const base = {
    hwKey: result.hwKey,
    resultKey: result.resultKey,
    precision: result.precision,
    ...(result.date ? { date: result.date } : {}),
  };
  if (result.clamped) return { ...base, reason: 'outside-measured-range' };
  // Per chip-hour the denominator is one GPU-hour, so power never enters.
  const gpuHours = assumptions.basis === 'chip-hour' ? 1 : gpuHoursPerGwYear(specs.powerKwPerGpu);
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
  const labCut = revenue * labShare;
  const profit = grossMargin - labCut;

  return {
    ...base,
    gpuHours,
    revenuePerGpuHour,
    revenue,
    tco,
    grossMargin,
    labCut,
    profit,
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

/** Format a $/GPU/hr figure: cents matter, so a fixed two decimals with the sign in front. */
export function formatUsdPerChipHour(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(digits)}`;
}

/**
 * Formatter for the basis in use. `digits` is the compact-unit precision on
 * the GW-year basis (0 for axis ticks, 1 for labels) and is ignored per
 * chip-hour, where two decimals always read right.
 */
export function formatProfitUsd(value: number, basis: ProfitBasis, digits?: number): string {
  return basis === 'chip-hour' ? formatUsdPerChipHour(value) : formatUsdCompact(value, digits);
}

/**
 * Models that have AgentX (agentic-trace) rows in the availability table, in
 * the order of `models`. The estimator only prices agentic workloads: fixed
 * ISL/OSL scenarios have no cache-hit telemetry and their token mix is
 * synthetic, so a $/GW-year figure built on them would not describe a real
 * serving fleet. `dbKeysFor` maps a display model to its DB model keys.
 */
export function modelsWithAgenticData<M extends string>(
  models: readonly M[],
  rows: readonly { model: string; benchmark_type: string }[] | undefined,
  dbKeysFor: (model: M) => readonly string[],
): M[] {
  if (!rows) return [...models];
  const agenticDbModels = new Set(
    rows.filter((row) => row.benchmark_type === 'agentic_traces').map((row) => row.model),
  );
  return models.filter((model) => dbKeysFor(model).some((key) => agenticDbModels.has(key)));
}

/**
 * Parse a custom $/M tok field. Empty or negative input is rejected so a
 * half-typed field disables the chart instead of pricing tokens at $0.
 */
export function parseTokenPriceInput(raw: string): number | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
