import { modelSystemPower } from '@/lib/modeled-system-power';
import type { TokenRevenuePricing } from '@/components/inference/types';

import {
  estimateProfitRows,
  estimateSkuProfit,
  isProfitEstimatorRow,
  type ProfitEstimatorAssumptions,
  type ProfitEstimatorOutput,
  type ProfitEstimatorSpecs,
} from './profit-estimator';
import type { GPUDataPoint, InterpolatedResult } from './types';

export type ProfitPowerBasis = 'provisioned' | 'modeled' | 'compare';

function planningKwPerGpu(point: GPUDataPoint): number | null {
  const row = point.sourceRow;
  if (!row || row.metrics.power_metric_schema_version !== 2) return null;
  const estimate = modelSystemPower(row, undefined, true);
  if (
    estimate.status !== 'supported' ||
    estimate.gpuCount !== 8 ||
    estimate.topologyBasis !== 'single-node' ||
    estimate.chassisBasis !== 'full'
  )
    return null;
  return (estimate.deploymentFacilityWatts / estimate.gpuCount / 1000) * 1.1;
}

/** Reusing the original frontier prevents the power choice from changing throughput. */
export function modeledPowerAtTarget(result: InterpolatedResult, target: number): number | null {
  if (result.clamped) return null;
  const exact = result.nearestPoints.find((p) => Math.abs(p.interactivity - target) < 1e-9);
  if (exact) return planningKwPerGpu(exact);
  const [left, right] = result.nearestPoints;
  if (!left || !right || target < left.interactivity || target > right.interactivity) return null;
  const lower = planningKwPerGpu(left),
    upper = planningKwPerGpu(right);
  if (lower === null || upper === null || right.interactivity <= left.interactivity) return null;
  return (
    lower +
    ((upper - lower) * (target - left.interactivity)) / (right.interactivity - left.interactivity)
  );
}

export function estimateProfitByPower(
  results: readonly (InterpolatedResult & { date?: string })[],
  specsFor: (hwKey: string) => ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
  powerBasis: ProfitPowerBasis,
  target: number,
  labels: { provisioned: string; modeled: string },
): ProfitEstimatorOutput {
  if (powerBasis === 'provisioned' || assumptions.basis === 'chip-hour') {
    return estimateProfitRows(results, specsFor, pricing, assumptions);
  }
  const output: ProfitEstimatorOutput = { rows: [], skipped: [] };
  for (const result of results) {
    const specs = specsFor(result.hwKey);
    const baseline = estimateSkuProfit(result, specs, pricing, assumptions);
    if (!isProfitEstimatorRow(baseline)) {
      output.skipped.push(baseline);
      continue;
    }
    const power = modeledPowerAtTarget(result, target);
    if (power === null) {
      output.skipped.push({
        hwKey: result.hwKey,
        resultKey: result.resultKey,
        precision: result.precision,
        date: result.date,
        reason: 'no-measured-power',
      });
      continue;
    }
    const modeled = estimateSkuProfit(
      result,
      { ...specs, powerKwPerGpu: power },
      pricing,
      assumptions,
    );
    if (!isProfitEstimatorRow(modeled)) {
      output.skipped.push(modeled);
      continue;
    }
    if (powerBasis === 'compare') {
      output.rows.push(
        {
          ...baseline,
          resultKey: `${baseline.resultKey}__provisioned`,
          powerLabel: labels.provisioned,
        },
        {
          ...modeled,
          resultKey: `${modeled.resultKey}__modeled`,
          powerLabel: labels.modeled,
        },
      );
    } else output.rows.push(modeled);
  }
  // Sorting paired rows by profit would separate estimates of the same configuration.
  if (powerBasis !== 'compare')
    output.rows.sort((a, b) => b.profit - a.profit || a.resultKey.localeCompare(b.resultKey));
  return output;
}
