import { modelSystemPower, type SystemPowerUnit } from '@/lib/power/modeled-system-power';
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
import { interpolateForGPU } from './interpolation';
import type { CalculatorMode, CostProvider, GPUDataPoint, InterpolatedResult } from './types';

export type ProfitPowerBasis = 'provisioned' | 'modeled' | 'compare';

export interface ProfitPowerSource {
  topology: SystemPowerUnit;
  cpu: 'measured' | 'modeled';
  pue: number;
  modelRevision: string;
}

export interface ProfitPlanningPower {
  kwPerGpu: number;
  source: ProfitPowerSource;
  extrapolated: boolean;
}

export function powerSourceKey(source: ProfitPowerSource): string {
  return [source.topology, source.cpu, source.pue, source.modelRevision].join('|');
}

type PlanningPower = ProfitPlanningPower | { reason: ProfitEstimatorSkipReason };

function planningPower(point: GPUDataPoint): PlanningPower {
  const row = point.sourceRow;
  if (!row || row.metrics.power_metric_schema_version !== 2) return { reason: 'no-measured-power' };
  const estimate = modelSystemPower(row);
  if (estimate.status !== 'supported') {
    switch (estimate.reason) {
      case 'hardware': {
        return { reason: 'unsupported-power-hardware' };
      }
      case 'topology':
      case 'role-power': {
        return { reason: 'unsupported-power-topology' };
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
  const unitGpus = estimate.modeledGpuCount / estimate.chassisCount;
  if (
    estimate.chassisBasis === 'extrapolated' &&
    (estimate.topologyBasis !== 'single-node' || unitGpus % estimate.gpuCount !== 0)
  )
    return { reason: 'unsupported-power-topology' };
  return {
    kwPerGpu: (estimate.deploymentFacilityWatts / estimate.gpuCount / 1000) * 1.1,
    extrapolated: estimate.chassisBasis === 'extrapolated',
    source: {
      topology: estimate.unit,
      cpu: estimate.unit === 'nvl72-tray' ? estimate.cpuBasis : 'modeled',
      pue: estimate.pue,
      modelRevision: estimate.modelRevision,
    },
  };
}

export function interpolateProfitForGPU(
  points: GPUDataPoint[],
  target: number,
  mode: CalculatorMode,
  costProvider: CostProvider,
  powerBasis: ProfitPowerBasis,
): InterpolatedResult | null {
  const original = interpolateForGPU(points, target, mode, costProvider);
  if (powerBasis === 'provisioned' || mode !== 'interactivity_to_throughput') return original;
  const cohorts = new Map<string, GPUDataPoint[]>();
  for (const point of points) {
    const power = planningPower(point);
    if ('reason' in power) continue;
    const key = powerSourceKey(power.source);
    const cohort = cohorts.get(key) ?? [];
    cohort.push(point);
    cohorts.set(key, cohort);
  }
  let best: InterpolatedResult | null = null;
  for (const key of [...cohorts.keys()].toSorted()) {
    const candidate = interpolateForGPU(cohorts.get(key)!, target, mode, costProvider);
    if (!candidate || 'reason' in modeledPowerAtTarget(candidate, target)) continue;
    if (!best || candidate.value > best.value) best = candidate;
  }
  return best ?? original;
}

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
  if (powerBasis !== 'compare')
    output.rows.sort((a, b) => b.profit - a.profit || a.resultKey.localeCompare(b.resultKey));
  return output;
}
