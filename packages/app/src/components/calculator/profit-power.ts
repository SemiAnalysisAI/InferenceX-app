import { modelSystemPower, type SystemPowerSensorKind } from '@/lib/modeled-system-power';
import { type RackMeasuredBasis, systemPowerSourceSha256 } from '@/lib/system-power-model';
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

interface ProfitPowerProfile {
  /** Facility PUE the estimate applied once at the chassis or rack AC boundary. */
  pue: number;
  modelPath: string;
  modelRevision: string;
  /** SHA-256 of the pinned source file behind `modelPath`; null if the profile lacks one. */
  profileSha256: string | null;
}

/**
 * What the measured + modeled budget was measured on. An eight-GPU x86 chassis
 * measures the GPU boards and models the rest; an NVL72 tray measures the compute
 * module (or GPU board + Grace socket) and models only the rack residual.
 */
export type ProfitPowerSource =
  | (ProfitPowerProfile & { topology: 'chassis' })
  | (ProfitPowerProfile & {
      topology: 'nvl72-trays';
      measuredBasis: RackMeasuredBasis;
      sensorKind: SystemPowerSensorKind;
    });

export interface ProfitPlanningPower {
  kwPerGpu: number;
  source: ProfitPowerSource;
}

/** Identity of a source for deduplicating notes and refusing to mix bases between knots. */
export function powerSourceKey(source: ProfitPowerSource): string {
  return [
    source.topology,
    source.pue,
    source.modelPath,
    source.modelRevision,
    source.topology === 'nvl72-trays' ? `${source.measuredBasis}/${source.sensorKind}` : '',
  ].join('|');
}

/**
 * Planning kW/GPU: facility watts per measured GPU plus the 10% planning margin.
 * Accepted: one complete eight-GPU chassis, or NVL72 compute trays that are all
 * fully measured. A partial unit would price its unmeasured GPUs at a modeled share.
 */
function planningPower(point: GPUDataPoint): ProfitPlanningPower | null {
  const row = point.sourceRow;
  if (!row || row.metrics.power_metric_schema_version !== 2) return null;
  const estimate = modelSystemPower(row, undefined, true);
  if (estimate.status !== 'supported' || estimate.chassisBasis !== 'full') return null;
  const profile: ProfitPowerProfile = {
    pue: estimate.pue,
    modelPath: estimate.modelPath,
    modelRevision: estimate.modelRevision,
    profileSha256: systemPowerSourceSha256(estimate.modelPath),
  };
  let source: ProfitPowerSource;
  if (estimate.topologyBasis === 'nvl72-trays') {
    source = {
      ...profile,
      topology: 'nvl72-trays',
      measuredBasis: estimate.measuredBasis,
      sensorKind: estimate.sensorKind,
    };
  } else if (estimate.topologyBasis === 'single-node' && estimate.gpuCount === 8) {
    source = { ...profile, topology: 'chassis' };
  } else return null;
  return {
    kwPerGpu: (estimate.deploymentFacilityWatts / estimate.gpuCount / 1000) * 1.1,
    source,
  };
}

/** Reusing the original frontier prevents the power choice from changing throughput. */
export function modeledPlanningPowerAtTarget(
  result: InterpolatedResult,
  target: number,
): ProfitPlanningPower | null {
  if (result.clamped) return null;
  const exact = result.nearestPoints.find((p) => Math.abs(p.interactivity - target) < 1e-9);
  if (exact) return planningPower(exact);
  const [left, right] = result.nearestPoints;
  if (!left || !right || target < left.interactivity || target > right.interactivity) return null;
  const lower = planningPower(left),
    upper = planningPower(right);
  if (!lower || !upper || right.interactivity <= left.interactivity) return null;
  // Two knots measured on different bases would price one bar on two sensors.
  if (powerSourceKey(lower.source) !== powerSourceKey(upper.source)) return null;
  return {
    kwPerGpu:
      lower.kwPerGpu +
      ((upper.kwPerGpu - lower.kwPerGpu) * (target - left.interactivity)) /
        (right.interactivity - left.interactivity),
    source: lower.source,
  };
}

export function modeledPowerAtTarget(result: InterpolatedResult, target: number): number | null {
  return modeledPlanningPowerAtTarget(result, target)?.kwPerGpu ?? null;
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
    const power = modeledPlanningPowerAtTarget(result, target);
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
    const estimated = estimateSkuProfit(
      result,
      { ...specs, powerKwPerGpu: power.kwPerGpu },
      pricing,
      assumptions,
    );
    if (!isProfitEstimatorRow(estimated)) {
      output.skipped.push(estimated);
      continue;
    }
    const modeled = { ...estimated, powerSource: power.source };
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
