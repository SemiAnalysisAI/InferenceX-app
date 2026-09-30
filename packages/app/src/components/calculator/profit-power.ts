import { modelSystemPower, type SystemPowerSensorKind } from '@/lib/modeled-system-power';
import { type RackMeasuredBasis, systemPowerSourceSha256 } from '@/lib/system-power-model';
import type { TokenRevenuePricing } from '@/components/inference/types';

import {
  estimateProfitRows,
  estimateSkuProfit,
  isProfitEstimatorRow,
  type ProfitEstimatorAssumptions,
  type ProfitEstimatorOutput,
  type ProfitEstimatorSkipReason,
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
  extrapolated: boolean;
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

type PlanningPower = ProfitPlanningPower | { reason: ProfitEstimatorSkipReason };

function planningPower(point: GPUDataPoint): PlanningPower {
  const row = point.sourceRow;
  if (!row || row.metrics.power_metric_schema_version !== 2) return { reason: 'no-measured-power' };
  const estimate = modelSystemPower(row, undefined, true);
  if (estimate.status !== 'supported') {
    switch (estimate.reason) {
      case 'hardware': {
        return { reason: 'unsupported-power-hardware' };
      }
      case 'topology':
      case 'role-power': {
        return { reason: 'unsupported-power-topology' };
      }
      case 'cpu-telemetry': {
        return { reason: 'no-cpu-power' };
      }
      case 'telemetry':
      case 'gpu-count': {
        return { reason: 'no-measured-power' };
      }
      default: {
        return { reason: 'outside-power-model' };
      }
    }
  }
  // Partial allocations must tile one host; fully measured multi-host estimates
  // retain their validated worker-hosts or uniform-hosts topology.
  if (
    estimate.chassisBasis === 'extrapolated' &&
    (estimate.topologyBasis !== 'single-node' || 8 % estimate.gpuCount !== 0)
  )
    return { reason: 'unsupported-power-topology' };
  const profile: ProfitPowerProfile = {
    pue: estimate.pue,
    modelPath: estimate.modelPath,
    modelRevision: estimate.modelRevision,
    profileSha256: systemPowerSourceSha256(estimate.modelPath),
  };
  const source: ProfitPowerSource =
    estimate.topologyBasis === 'nvl72-trays'
      ? {
          ...profile,
          topology: 'nvl72-trays',
          measuredBasis: estimate.measuredBasis,
          sensorKind: estimate.sensorKind,
        }
      : { ...profile, topology: 'chassis' };
  return {
    kwPerGpu: (estimate.deploymentFacilityWatts / estimate.gpuCount / 1000) * 1.1,
    extrapolated: estimate.chassisBasis === 'extrapolated',
    source,
  };
}

/** Reusing the original frontier prevents the power choice from changing throughput. */
export function modeledPowerAtTarget(result: InterpolatedResult, target: number): PlanningPower {
  if (result.clamped) return { reason: 'outside-measured-range' };
  const exact = result.nearestPoints.find((p) => Math.abs(p.interactivity - target) < 1e-9);
  if (exact) return planningPower(exact);
  const [left, right] = result.nearestPoints;
  if (
    !left ||
    !right ||
    target < left.interactivity ||
    target > right.interactivity ||
    right.interactivity <= left.interactivity
  )
    return { reason: 'outside-measured-range' };
  const lower = planningPower(left),
    upper = planningPower(right);
  if ('reason' in lower) return lower;
  if ('reason' in upper) return upper;
  if (powerSourceKey(lower.source) !== powerSourceKey(upper.source))
    return { reason: 'incompatible-power-basis' };
  return {
    kwPerGpu:
      lower.kwPerGpu +
      ((upper.kwPerGpu - lower.kwPerGpu) * (target - left.interactivity)) /
        (right.interactivity - left.interactivity),
    extrapolated: lower.extrapolated || upper.extrapolated,
    source: lower.source,
  };
}

export function estimateProfitByPower(
  results: readonly (InterpolatedResult & { date?: string })[],
  specsFor: (hwKey: string) => ProfitEstimatorSpecs,
  pricing: TokenRevenuePricing,
  assumptions: ProfitEstimatorAssumptions,
  powerBasis: ProfitPowerBasis,
  target: number,
  labels: { provisioned: string; modeled: string; extrapolated: string },
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
    if (powerBasis === 'compare') {
      output.rows.push({
        ...baseline,
        resultKey: `${baseline.resultKey}__provisioned`,
        powerLabel: labels.provisioned,
      });
    }
    const power = modeledPowerAtTarget(result, target);
    if ('reason' in power) {
      output.skipped.push({
        hwKey: result.hwKey,
        resultKey: result.resultKey,
        precision: result.precision,
        date: result.date,
        reason: power.reason,
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
      output.rows.push({
        ...modeled,
        resultKey: `${modeled.resultKey}__modeled`,
        powerLabel: power.extrapolated
          ? `${labels.modeled} · ${labels.extrapolated}`
          : labels.modeled,
      });
    } else
      output.rows.push(
        power.extrapolated ? { ...modeled, powerLabel: labels.extrapolated } : modeled,
      );
  }
  // Sorting paired rows by profit would separate estimates of the same configuration.
  if (powerBasis !== 'compare')
    output.rows.sort((a, b) => b.profit - a.profit || a.resultKey.localeCompare(b.resultKey));
  return output;
}
