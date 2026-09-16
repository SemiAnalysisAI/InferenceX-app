import type { InferenceData } from '@/components/inference/types';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

import { canonicalParetoIntersection } from './canonicalFrontier';

const POWER_CURVE_METRICS: ReadonlySet<string> = new Set([
  'y_measuredAvgPower',
  'y_measuredP75Power',
  'y_measuredP90Power',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPowerPercentTdp',
  'y_modeledChassisPowerPerGpu',
  'y_powerxGpuProvisionedWatts',
  'y_powerxUtilityProvisionedWatts',
  'y_powerxUtilityModeledWatts',
]);

export function isPowerCurveMetric(metric: string): boolean {
  return POWER_CURVE_METRICS.has(metric);
}

export function isMeasuredPowerCurveMetric(metric: string): boolean {
  return isPowerCurveMetric(metric) && metric.startsWith('y_measured');
}

export function isDerivedPowerCurveMetric(metric: string): boolean {
  return isPowerCurveMetric(metric) && metric.startsWith('y_powerx');
}

/** No declared direction means there is no Pareto frontier to draw or filter by. */
export function chartFrontier(
  points: InferenceData[],
  direction: ParetoDirection | undefined,
): InferenceData[] {
  if (!direction) return [];
  return (
    canonicalParetoIntersection(points, direction) ??
    paretoFrontForDirection(direction)(points.filter(isFrontierEligible))
  );
}

/**
 * Higher-power outer boundary across tested configurations, not an efficiency
 * frontier. Unique X vertices avoid concurrency backtracking during smoothing.
 * Callers scope the samples by hardware, precision, date and overlay run.
 */
export function upperPowerEnvelope(
  points: readonly InferenceData[],
  maximizeX: boolean,
  retainPlateaus = false,
): InferenceData[] {
  const sorted = points
    .filter((point) => isFrontierEligible(point) && Number.isFinite(point.y) && point.y > 0)
    .sort((a, b) => (maximizeX ? b.x - a.x : a.x - b.x) || b.y - a.y);
  let maxY = -Infinity;
  let previousX: number | undefined;
  const envelope = sorted.filter((point) => {
    if (point.y < maxY || (!retainPlateaus && point.y === maxY) || point.x === previousX)
      return false;
    previousX = point.x;
    maxY = point.y;
    return true;
  });
  return maximizeX ? envelope.toReversed() : envelope;
}
