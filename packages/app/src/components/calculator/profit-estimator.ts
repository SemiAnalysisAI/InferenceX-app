import { tokenRevenueFromRatesPerGpuHour } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { Model } from '@/lib/catalog/data-mappings';

import type { ProfitPowerSource } from './profit-power';
import type { InterpolatedResult } from './types';

export const HOURS_PER_YEAR = 8_760;
const KW_PER_GW = 1_000_000;

export const DEFAULT_PROFIT_INTERACTIVITY = 45;
export const DEFAULT_LAB_CUT_PCT = 30;

export interface ProfitListPricing {
  vendor: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  sourceUrl: string;
}

export interface ProfitModelDefaults {
  interactivity: number;
  listPricing: ProfitListPricing | null;
  labCutPct: number;
}

const PROFIT_MODEL_DEFAULTS: Partial<Record<Model, ProfitModelDefaults>> = {
  [Model.DeepSeek_V4_Pro]: {
    interactivity: 35,
    labCutPct: 0,
    listPricing: {
      vendor: 'DeepSeek',
      inputPerMillion: 1.32,
      cachedInputPerMillion: 0.044,
      outputPerMillion: 3.96,
      sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    },
  },
  [Model.DeepSeek_V4_1_Flash]: {
    interactivity: 125,
    labCutPct: 0,
    listPricing: {
      vendor: 'DeepSeek',
      inputPerMillion: 0.3,
      cachedInputPerMillion: 0.006,
      outputPerMillion: 1.2,
      sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing/',
    },
  },
  [Model.Kimi_K3]: {
    interactivity: DEFAULT_PROFIT_INTERACTIVITY,
    labCutPct: DEFAULT_LAB_CUT_PCT,
    listPricing: {
      vendor: 'Moonshot',
      inputPerMillion: 3,
      cachedInputPerMillion: 0.3,
      outputPerMillion: 15,
      sourceUrl: 'https://platform.kimi.ai/docs/pricing/chat-k3',
    },
  },
  [Model.GLM_5_2]: {
    interactivity: 100,
    labCutPct: 20,
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

export function profitModelDefaults(model: Model): ProfitModelDefaults {
  return PROFIT_MODEL_DEFAULTS[model] ?? FALLBACK_MODEL_DEFAULTS;
}

export function listPricingToTokenRevenuePricing(list: ProfitListPricing): TokenRevenuePricing {
  return {
    source: 'normalized',
    inputPerMillion: list.inputPerMillion,
    cachedInputPerMillion: list.cachedInputPerMillion,
    outputPerMillion: list.outputPerMillion,
  };
}

export type CacheHitMode = 'actual' | 'theoretical';
export const DEFAULT_CACHE_HIT_MODE: CacheHitMode = 'theoretical';

export const DEFAULT_UTILIZATION_PCT = 60;

export type ProfitBasis = 'chip-hour' | 'gw-year';

export interface ProfitEstimatorAssumptions {
  powerBasis?: 'provisioned' | 'modeled' | 'compare';
  utilizationPct: number;
  labCutPct: number;
  basis: ProfitBasis;
}

export interface ProfitEstimatorRow {
  powerLabel?: string;
  powerSource?: ProfitPowerSource;
  hwKey: string;
  resultKey: string;
  precision?: string;
  date?: string;
  dateLabel?: string;
  gpuHours: number;
  revenuePerGpuHour: number;
  revenue: number;
  tco: number;
  grossMargin: number;
  labCut: number;
  profit: number;
}

export type ProfitEstimatorSkipReason =
  | 'no-measured-power'
  | 'incompatible-power-basis'
  | 'unsupported-power-hardware'
  | 'unsupported-power-topology'
  | 'outside-power-model'
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

export function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

export function gpuHoursPerGwYear(powerKwPerGpu: number): number | null {
  if (!(powerKwPerGpu > 0)) return null;
  return (KW_PER_GW / powerKwPerGpu) * HOURS_PER_YEAR;
}

export interface ProfitEstimatorSpecs {
  powerKwPerGpu: number;
  costPerGpuHour: number;
}

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
  rows.sort((a, b) => b.profit - a.profit || a.resultKey.localeCompare(b.resultKey));
  return { rows, skipped };
}

export function formatUsdCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(digits)}k`;
  return `${sign}$${abs.toFixed(abs >= 100 ? 0 : digits)}`;
}

export function formatUsdPerChipHour(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(digits)}`;
}

export function formatProfitUsd(value: number, basis: ProfitBasis, digits?: number): string {
  return basis === 'chip-hour' ? formatUsdPerChipHour(value) : formatUsdCompact(value, digits);
}

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

export function applyCacheHitMode<
  T extends { cacheHitRate?: number; theoreticalCacheHitRate?: number },
>(results: readonly T[], mode: CacheHitMode): T[] {
  if (mode === 'actual') return results as T[];
  return results.map((r) =>
    typeof r.theoreticalCacheHitRate === 'number'
      ? { ...r, cacheHitRate: r.theoreticalCacheHitRate }
      : r,
  );
}

export function parseTokenPriceInput(raw: string): number | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
