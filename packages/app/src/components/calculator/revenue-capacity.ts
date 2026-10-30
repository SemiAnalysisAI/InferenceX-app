import { tokenRevenueFromRatesPerGpuHour } from '@/components/inference/token-revenue';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { HOURS_PER_YEAR } from './profit-estimator';
import type { InterpolatedResult } from './types';

export const REVENUE_PERIOD_HOURS = {
  month: HOURS_PER_YEAR / 12,
  quarter: HOURS_PER_YEAR / 4,
  year: HOURS_PER_YEAR,
} as const;

export type RevenuePeriod = keyof typeof REVENUE_PERIOD_HOURS;
export type RevenueCapacityReason =
  | 'outside-measured-range'
  | 'no-token-mix'
  | 'zero-revenue'
  | 'unsafe-fleet-size';

export interface RevenueCapacityRow {
  hwKey: string;
  resultKey: string;
  precision?: string;
  isOverlay?: boolean;
  runIndex?: number;
  runLabel?: string;
  runUrl?: string;
  sourceUrls: string[];
  sourceDates: string[];
  revenuePerGpuHour: number;
  realizedRevenuePerGpuHour: number;
  gpuEquivalents: number;
  requiredGpus: number;
  deploymentGpus: number | null;
  deployments: number | null;
  projectedRevenue: number;
}

export interface RevenueCapacityOutput {
  rows: RevenueCapacityRow[];
  skipped: {
    hwKey: string;
    resultKey: string;
    precision?: string;
    reason: RevenueCapacityReason;
  }[];
}

export function deploymentSize(result: InterpolatedResult): number | null {
  const sizes = result.nearestPoints.map(({ sourceRow: row }) => {
    if (!row) return null;
    const count = row.disagg
      ? row.num_prefill_gpu + row.num_decode_gpu
      : row.num_decode_gpu > 0
        ? row.num_decode_gpu
        : row.num_prefill_gpu;
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  });
  const first = sizes[0];
  const topologies = result.nearestPoints.map(({ sourceRow: row }) =>
    row
      ? JSON.stringify([
          row.disagg,
          row.prefill_tp,
          row.prefill_ep,
          row.prefill_num_workers,
          row.decode_tp,
          row.decode_ep,
          row.decode_num_workers,
          row.num_prefill_gpu,
          row.num_decode_gpu,
          row.prefill_dp_attention,
          row.decode_dp_attention,
        ])
      : null,
  );
  // An interpolated curve can bridge different deployments; do not invent a common topology.
  return first &&
    sizes.every((size) => size === first) &&
    topologies.every((topology) => topology === topologies[0])
    ? first
    : null;
}

export function estimateRevenueCapacity(
  results: readonly InterpolatedResult[],
  pricing: TokenRevenuePricing,
  revenueTarget: number,
  period: RevenuePeriod,
  utilizationPct: number,
): RevenueCapacityOutput {
  if (
    !Number.isFinite(revenueTarget) ||
    revenueTarget < 0 ||
    !Object.hasOwn(REVENUE_PERIOD_HOURS, period) ||
    !Number.isFinite(utilizationPct) ||
    utilizationPct < 0 ||
    utilizationPct > 100
  ) {
    throw new RangeError('Invalid revenue target, period or utilization');
  }
  const output: RevenueCapacityOutput = { rows: [], skipped: [] };
  for (const result of results) {
    const base = {
      hwKey: result.hwKey,
      resultKey: result.resultKey,
      precision: result.precision,
    };
    const skip = (reason: RevenueCapacityReason) => output.skipped.push({ ...base, reason });
    if (result.clamped) {
      skip('outside-measured-range');
      continue;
    }
    const hourly = tokenRevenueFromRatesPerGpuHour(
      result.value,
      result.inputTokenShare ?? null,
      result.cacheHitRate ?? null,
      pricing,
    );
    if (hourly === null) {
      skip('no-token-mix');
      continue;
    }
    const realized = hourly * (utilizationPct / 100);
    if (!Number.isFinite(realized) || realized < 0 || (realized === 0 && revenueTarget > 0)) {
      skip('zero-revenue');
      continue;
    }
    const perPeriod = realized * REVENUE_PERIOD_HOURS[period];
    const gpuEquivalents = revenueTarget === 0 ? 0 : revenueTarget / perPeriod;
    const deploymentGpus = deploymentSize(result);
    const block = deploymentGpus ?? 1;
    const requiredGpus = Math.ceil(gpuEquivalents / block) * block;
    const projectedRevenue = requiredGpus * perPeriod;
    if (!Number.isSafeInteger(requiredGpus) || !Number.isFinite(projectedRevenue)) {
      skip('unsafe-fleet-size');
      continue;
    }
    output.rows.push({
      ...base,
      isOverlay: result.isOverlay,
      runIndex: result.runIndex,
      runLabel: result.runLabel,
      runUrl: result.runUrl,
      sourceUrls: [
        ...new Set(
          result.nearestPoints.flatMap((p) => (p.sourceRow?.run_url ? [p.sourceRow.run_url] : [])),
        ),
      ],
      sourceDates: [
        ...new Set(
          result.nearestPoints.flatMap((p) => (p.sourceRow?.date ? [p.sourceRow.date] : [])),
        ),
      ],
      revenuePerGpuHour: hourly,
      realizedRevenuePerGpuHour: realized,
      gpuEquivalents,
      requiredGpus,
      deploymentGpus,
      deployments: deploymentGpus ? requiredGpus / deploymentGpus : null,
      projectedRevenue,
    });
  }
  output.rows.sort(
    (a, b) => a.requiredGpus - b.requiredGpus || a.resultKey.localeCompare(b.resultKey),
  );
  return output;
}
