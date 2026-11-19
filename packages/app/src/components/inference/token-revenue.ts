import type { InferenceData, TokenRevenuePricing } from './types';
import { measuredInputShare } from '@/lib/benchmarks/chip-basis';
import {
  DEFAULT_CACHED_INPUT_PRICE_RATIO,
  pricingCacheHitRate,
} from '@/lib/calculator/cache-pricing';

const SECONDS_PER_HOUR = 3_600;
const TOKENS_PER_MILLION = 1_000_000;
const RATE_SUM_RELATIVE_TOLERANCE = 0.01;

export const NORMALIZED_TOKEN_REVENUE_PRICING: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  cachedInputPerMillion: DEFAULT_CACHED_INPUT_PRICE_RATIO,
  outputPerMillion: 1,
};

export function formatTokenPrice(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function formatTokenPriceLabel(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function cachedInputPricePerMillion(pricing: TokenRevenuePricing): number {
  const explicit = pricing.cachedInputPerMillion;
  return typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0
    ? explicit
    : pricing.inputPerMillion * DEFAULT_CACHED_INPUT_PRICE_RATIO;
}

/** Whether the input/output token mix changes the blended price at all. */
export function tokenMixSetsPrice(pricing: TokenRevenuePricing, cacheHits: boolean): boolean {
  return (
    pricing.inputPerMillion !== pricing.outputPerMillion ||
    (cacheHits && cachedInputPricePerMillion(pricing) !== pricing.inputPerMillion)
  );
}

export function inputTokenShareForRevenue(point: InferenceData): number | null {
  // Per deployment chip on either chip basis, so the mix never follows the toggle.
  const measured = measuredInputShare(point, RATE_SUM_RELATIVE_TOLERANCE);
  if (measured !== null) return measured;

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

export function tokenRevenueFromRatesPerGpuHour(
  totalTokPerSecond: number,
  inputTokenShare: number | null,
  cacheHitRate: number | null,
  pricing: TokenRevenuePricing,
): number | null {
  if (!(totalTokPerSecond > 0)) return 0;

  const hit =
    typeof cacheHitRate === 'number' && Number.isFinite(cacheHitRate)
      ? Math.max(0, Math.min(1, cacheHitRate))
      : 0;

  if (!tokenMixSetsPrice(pricing, hit > 0)) {
    return (totalTokPerSecond * SECONDS_PER_HOUR * pricing.inputPerMillion) / TOKENS_PER_MILLION;
  }

  if (inputTokenShare === null || !Number.isFinite(inputTokenShare)) return null;
  const inputShare = Math.max(0, Math.min(1, inputTokenShare));
  const inputPriceAtPoint =
    (1 - hit) * pricing.inputPerMillion + hit * cachedInputPricePerMillion(pricing);
  const blendedPriceAtPoint =
    inputShare * inputPriceAtPoint + (1 - inputShare) * pricing.outputPerMillion;
  return (totalTokPerSecond * SECONDS_PER_HOUR * blendedPriceAtPoint) / TOKENS_PER_MILLION;
}

export function tokenRevenuePerGpuHour(
  point: InferenceData,
  pricing: TokenRevenuePricing,
): number | null {
  const total = point.tput_per_gpu ?? 0;
  const cacheHitRate = pricingCacheHitRate(point);
  const inputShare = tokenMixSetsPrice(pricing, (cacheHitRate ?? 0) > 0)
    ? inputTokenShareForRevenue(point)
    : null;
  return tokenRevenueFromRatesPerGpuHour(total, inputShare, cacheHitRate, pricing);
}

export function usesTokenSalePricing(metricConfigKey: string): boolean {
  return metricConfigKey === 'y_tokenRevenuePerGpuHour';
}

export function applyTokenRevenuePricing(
  points: InferenceData[],
  pricing: TokenRevenuePricing | null,
): InferenceData[] {
  return points.map((point) => {
    let next: InferenceData;
    if (Object.hasOwn(point, 'tokenRevenuePerGpuHour')) {
      const { tokenRevenuePerGpuHour: _previous, ...rest } = point;
      next = rest;
    } else next = { ...point };
    if (!pricing) return next;

    const revenue = tokenRevenuePerGpuHour(point, pricing);
    if (revenue !== null) {
      next.tokenRevenuePerGpuHour = { y: revenue, roof: false };
    }
    return next;
  });
}
