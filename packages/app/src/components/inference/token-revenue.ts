import type { InferenceData, TokenRevenuePricing } from './types';

const SECONDS_PER_HOUR = 3_600;
const TOKENS_PER_MILLION = 1_000_000;
const RATE_SUM_RELATIVE_TOLERANCE = 0.01;

export const NORMALIZED_TOKEN_REVENUE_PRICING: TokenRevenuePricing = {
  source: 'normalized',
  inputPerMillion: 1,
  outputPerMillion: 1,
};

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

  const isl = point.isl ?? 0;
  const osl = point.osl ?? 0;
  if (isl + osl > 0) return isl / (isl + osl);

  const prompt = point.total_prompt_tokens ?? 0;
  const generation = point.total_generation_tokens ?? 0;
  if (prompt + generation > 0) return prompt / (prompt + generation);

  return null;
}

/** Gross token revenue at one benchmark operating point, in $/GPU/hr. */
export function tokenRevenuePerGpuHour(
  point: InferenceData,
  pricing: TokenRevenuePricing,
): number | null {
  const total = point.tput_per_gpu ?? 0;
  if (!(total > 0)) return 0;

  // Equal input/output prices collapse exactly to total throughput and do not
  // require token-mix telemetry. This is the normalized $1/M default.
  if (pricing.inputPerMillion === pricing.outputPerMillion) {
    return (total * SECONDS_PER_HOUR * pricing.inputPerMillion) / TOKENS_PER_MILLION;
  }

  const inputShare = inputTokenShareForRevenue(point);
  if (inputShare === null) return null;
  const blendedPriceAtPoint =
    inputShare * pricing.inputPerMillion + (1 - inputShare) * pricing.outputPerMillion;
  return (total * SECONDS_PER_HOUR * blendedPriceAtPoint) / TOKENS_PER_MILLION;
}

/**
 * Recompute the revenue field without mutating transformed benchmark points.
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
