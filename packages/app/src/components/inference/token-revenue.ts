import type { InferenceData, TokenRevenuePricing } from './types';
import { DEFAULT_CACHED_INPUT_PRICE_RATIO, measuredCacheHitRate } from '@/lib/cache-pricing';

const SECONDS_PER_HOUR = 3_600;
const TOKENS_PER_MILLION = 1_000_000;
const RATE_SUM_RELATIVE_TOLERANCE = 0.01;

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

/** Whether a Y-axis option depends on the selected normalized or OpenRouter token prices. */
export function usesTokenSalePricing(metricConfigKey: string): boolean {
  return metricConfigKey === 'y_tokenRevenuePerGpuHour';
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
    delete next.tokenRevenuePerGpuHour;
    if (!pricing) return next;

    const revenue = tokenRevenuePerGpuHour(point, pricing);
    if (revenue !== null) {
      next.tokenRevenuePerGpuHour = { y: revenue, roof: false };
    }
    return next;
  });
}
