import type { InferenceData, TokenRevenuePricing } from './types';
import type { MetricDefinition } from './metric-registry';
import { DEFAULT_CACHED_INPUT_PRICE_RATIO, measuredCacheHitRate } from '@/lib/cache-pricing';
import { getGpuSpecs } from '@/lib/constants';

const SECONDS_PER_HOUR = 3_600;
const TOKENS_PER_MILLION = 1_000_000;
const RATE_SUM_RELATIVE_TOLERANCE = 0.01;
/** Calendar hours in the one-year window behind every $/GW/yr axis (365 x 24). */
export const HOURS_PER_YEAR = 8_760;
const KW_PER_GW = 1_000_000;

/**
 * Y-axis metrics whose value depends on the selected normalized or OpenRouter
 * token sale prices. Revenue axes price throughput directly; profit axes
 * subtract the per-tier TCO hourly cost before scaling to one all-in GW-year.
 */
export const TOKEN_SALE_PRICING_METRIC_KEYS = [
  'tokenRevenuePerGpuHour',
  'tokenRevenuePerGwYear',
  'tokenProfitPerGwYearH',
  'tokenProfitPerGwYearN',
  'tokenProfitPerGwYearR',
] as const;

export type TokenSalePricingMetricKey = (typeof TOKEN_SALE_PRICING_METRIC_KEYS)[number];

const TOKEN_SALE_PRICING_METRIC_KEY_SET: ReadonlySet<string> = new Set(
  TOKEN_SALE_PRICING_METRIC_KEYS,
);

/** TCO tier subtracted by each profit axis; revenue axes have no cost side. */
const PROFIT_TCO_TIER: Partial<Record<TokenSalePricingMetricKey, 'costh' | 'costn' | 'costr'>> = {
  tokenProfitPerGwYearH: 'costh',
  tokenProfitPerGwYearN: 'costn',
  tokenProfitPerGwYearR: 'costr',
};

export const NORMALIZED_TOKEN_REVENUE_PRICING: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  cachedInputPerMillion: DEFAULT_CACHED_INPUT_PRICE_RATIO,
  outputPerMillion: 1,
};

/** Format a $/M tok sale price consistently across revenue UI surfaces. */
export function formatTokenPrice(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Resolve an explicit cache-read price or use Fleet Lifecycle's 10% default. */
export function cachedInputPricePerMillion(pricing: TokenRevenuePricing): number {
  const explicit = pricing.cachedInputPerMillion;
  return typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0
    ? explicit
    : pricing.inputPerMillion * DEFAULT_CACHED_INPUT_PRICE_RATIO;
}

/**
 * Fraction of a point's per-GPU token throughput that is input.
 *
 * Aggregate rows report compatible input/output/total per-GPU rates, so their
 * measured split wins. Disaggregated rows report input per prefill GPU and
 * output per decode GPU while total throughput uses every GPU; for those rows
 * the fixed ISL:OSL shape or measured agentic prompt:generation totals supply
 * the like-for-like split.
 */
export function inputTokenShareForRevenue(point: InferenceData): number | null {
  const total = point.tput_per_gpu ?? 0;
  const input = point.input_tput_per_gpu ?? 0;
  const output = point.output_tput_per_gpu ?? 0;
  const sum = input + output;

  if (total > 0 && sum > 0 && Math.abs(sum / total - 1) <= RATE_SUM_RELATIVE_TOLERANCE) {
    return input / sum;
  }

  const { isl, osl } = point;
  if (typeof isl === 'number' && typeof osl === 'number' && isl + osl > 0) {
    return isl / (isl + osl);
  }

  const prompt = point.total_prompt_tokens;
  const generation = point.total_generation_tokens;
  if (typeof prompt === 'number' && typeof generation === 'number' && prompt + generation > 0) {
    return prompt / (prompt + generation);
  }

  return null;
}

/** Price interpolated or measured throughput components as gross $/GPU/hr. */
export function tokenRevenueFromRatesPerGpuHour(
  totalTokPerSecond: number,
  inputTokenShare: number | null,
  cacheHitRate: number | null,
  pricing: TokenRevenuePricing,
): number | null {
  if (!(totalTokPerSecond > 0)) return 0;

  const cachedInputPrice = cachedInputPricePerMillion(pricing);
  const hit =
    typeof cacheHitRate === 'number' && Number.isFinite(cacheHitRate)
      ? Math.max(0, Math.min(1, cacheHitRate))
      : 0;
  const cacheChangesPrice = hit > 0 && cachedInputPrice !== pricing.inputPerMillion;

  // Without a measured cache discount, equal input/output prices collapse
  // exactly to total throughput and do not require token-mix telemetry.
  if (pricing.inputPerMillion === pricing.outputPerMillion && !cacheChangesPrice) {
    return (totalTokPerSecond * SECONDS_PER_HOUR * pricing.inputPerMillion) / TOKENS_PER_MILLION;
  }

  if (inputTokenShare === null || !Number.isFinite(inputTokenShare)) return null;
  const inputShare = Math.max(0, Math.min(1, inputTokenShare));
  const inputPriceAtPoint = (1 - hit) * pricing.inputPerMillion + hit * cachedInputPrice;
  const blendedPriceAtPoint =
    inputShare * inputPriceAtPoint + (1 - inputShare) * pricing.outputPerMillion;
  return (totalTokPerSecond * SECONDS_PER_HOUR * blendedPriceAtPoint) / TOKENS_PER_MILLION;
}

/** Cache-aware gross token revenue at one benchmark operating point, in $/GPU/hr. */
export function tokenRevenuePerGpuHour(
  point: InferenceData,
  pricing: TokenRevenuePricing,
): number | null {
  const total = point.tput_per_gpu ?? 0;
  const cacheHitRate = measuredCacheHitRate(point);
  const inputShare = inputTokenShareForRevenue(point);
  return tokenRevenueFromRatesPerGpuHour(total, inputShare, cacheHitRate, pricing);
}

/** Whether a metric key (without the `y_` prefix) is priced from token sale prices. */
export function isTokenSalePricingMetric(
  metricKey: string,
): metricKey is TokenSalePricingMetricKey {
  return TOKEN_SALE_PRICING_METRIC_KEY_SET.has(metricKey);
}

/** Whether a Y-axis option depends on the selected normalized or OpenRouter token prices. */
export function usesTokenSalePricing(metricConfigKey: string): boolean {
  return metricConfigKey.startsWith('y_') && isTokenSalePricingMetric(metricConfigKey.slice(2));
}

/**
 * GPU-hours one all-in utility gigawatt buys in a year for this hardware.
 * `power` is the all-in kW per GPU from the SemiAnalysis AI Cloud TCO Model,
 * so 1 GW hosts `1,000,000 / power` GPUs, each running 8,760 hours. Returns null
 * when the hardware has no power figure so callers never divide by zero.
 */
export function gpuHoursPerGwYear(hwKey: string): number | null {
  const power = getGpuSpecs(hwKey).power;
  if (!(power > 0)) return null;
  return (KW_PER_GW / power) * HOURS_PER_YEAR;
}

/** Scale gross $/GPU/hr revenue to $/GW/yr for the hardware's all-in power. */
export function tokenRevenuePerGwYear(revenuePerGpuHour: number, hwKey: string): number | null {
  const gpuHours = gpuHoursPerGwYear(hwKey);
  return gpuHours === null ? null : revenuePerGpuHour * gpuHours;
}

/**
 * Net $/GW/yr after TCO: (revenue $/GPU/hr - tier TCO $/GPU/hr) x GPU-hours
 * per GW-year. Negative when the sale price does not cover the hardware cost
 * at that operating point. Null when the hardware lacks a power or TCO figure.
 */
export function tokenProfitPerGwYear(
  revenuePerGpuHour: number,
  hwKey: string,
  tier: 'costh' | 'costn' | 'costr',
): number | null {
  const gpuHours = gpuHoursPerGwYear(hwKey);
  if (gpuHours === null) return null;
  const tcoPerGpuHour = getGpuSpecs(hwKey)[tier];
  if (!(tcoPerGpuHour > 0)) return null;
  return (revenuePerGpuHour - tcoPerGpuHour) * gpuHours;
}

/**
 * Derive any sale-priced axis from already-priced $/GPU/hr revenue. Historical
 * Trends interpolates revenue per GPU hour once and maps it through here so
 * every revenue and profit axis shares one pricing path.
 */
export function tokenSalePricingMetricFromRevenuePerGpuHour(
  metricKey: TokenSalePricingMetricKey,
  revenuePerGpuHour: number,
  hwKey: string,
): number | null {
  if (metricKey === 'tokenRevenuePerGpuHour') return revenuePerGpuHour;
  if (metricKey === 'tokenRevenuePerGwYear') return tokenRevenuePerGwYear(revenuePerGpuHour, hwKey);
  const tier = PROFIT_TCO_TIER[metricKey];
  return tier ? tokenProfitPerGwYear(revenuePerGpuHour, hwKey, tier) : null;
}

const PRICE_SOURCE_SUFFIX_EN = {
  normalized: ' at Normalized Pricing',
  openrouter: ' at OpenRouter Pricing',
} as const;

const PRICE_SOURCE_PREFIX_ZH = {
  normalized: '按标准化价格计算的',
  openrouter: '按 OpenRouter 价格计算的',
} as const;

/** Insert the English price-source phrase before any trailing parenthetical. */
function withPriceSourceEn(text: string, suffix: string): string {
  const parenAt = text.indexOf(' (');
  return parenAt === -1
    ? `${text}${suffix}`
    : `${text.slice(0, parenAt)}${suffix}${text.slice(parenAt)}`;
}

/**
 * Axis and title copy for a sale-priced metric that names the active price
 * source, e.g. "Token Revenue per GPU Hour at OpenRouter Pricing ($/GPU/hr)".
 */
export function tokenSalePricingLabels(
  metric: Pick<MetricDefinition, 'label' | 'labelZh' | 'title' | 'titleZh'>,
  source: TokenRevenuePricing['source'],
): Pick<MetricDefinition, 'label' | 'labelZh' | 'title' | 'titleZh'> {
  const suffix = PRICE_SOURCE_SUFFIX_EN[source];
  const prefix = PRICE_SOURCE_PREFIX_ZH[source];
  return {
    label: withPriceSourceEn(metric.label, suffix),
    labelZh: `${prefix}${metric.labelZh}`,
    title: withPriceSourceEn(metric.title, suffix),
    titleZh: `${prefix}${metric.titleZh}`,
  };
}

/**
 * Recompute sale-price revenue without mutating transformed benchmark points.
 * A null price removes the normalized placeholder while OpenRouter is loading
 * or unavailable, so the chart never presents $1/M revenue as live pricing.
 */
export function applyTokenRevenuePricing(
  points: InferenceData[],
  pricing: TokenRevenuePricing | null,
): InferenceData[] {
  return points.map((point) => {
    const next = { ...point };
    for (const key of TOKEN_SALE_PRICING_METRIC_KEYS) delete next[key];
    if (!pricing) return next;

    const revenue = tokenRevenuePerGpuHour(point, pricing);
    if (revenue === null) return next;

    const hwKey = String(point.hwKey);
    for (const key of TOKEN_SALE_PRICING_METRIC_KEYS) {
      const value = tokenSalePricingMetricFromRevenuePerGpuHour(key, revenue, hwKey);
      if (value !== null) next[key] = { y: value, roof: false };
    }
    return next;
  });
}
