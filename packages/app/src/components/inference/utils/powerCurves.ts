import { isPowerBasisConfigKey } from '@/components/inference/metric-registry';
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
  // Provisioned / modelled boundary gauges: same upper-envelope curve as measured watts.
  'y_gpuProvisionedWatts',
  'y_utilityProvisionedWatts',
  'y_utilityModeledWatts',
]);

export function isPowerCurveMetric(metric: string): boolean {
  return POWER_CURVE_METRICS.has(metric);
}

/**
 * Power gauges whose curve is always the upper envelope and whose Optimal Only
 * toggle only hides off-envelope markers: measured watts plus the provisioned /
 * modelled boundary gauges that sit beside them. A Pareto corner would collapse
 * a flat TDP series to one marker. The modelled chassis axis keeps its legacy
 * Pareto behaviour.
 */
export function isMeasuredPowerCurveMetric(metric: string): boolean {
  return (
    isPowerCurveMetric(metric) &&
    (metric !== 'y_modeledChassisPowerPerGpu' || isPowerBasisConfigKey(metric))
  );
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
): InferenceData[] {
  const sorted = points
    .filter((point) => isFrontierEligible(point) && Number.isFinite(point.y) && point.y > 0)
    .sort((a, b) => (maximizeX ? b.x - a.x : a.x - b.x) || b.y - a.y);
  // Ties at the running maximum stay on the boundary: a flat series (a
  // provisioned TDP gauge) must still draw across its tested x-range instead
  // of collapsing to one marker. Repeated X keeps only its first vertex so the
  // smoothing never backtracks.
  let maxY = -Infinity;
  let lastX = Number.NaN;
  const envelope = sorted.filter((point) => {
    if (point.y < maxY || (point.y === maxY && point.x === lastX)) return false;
    maxY = point.y;
    lastX = point.x;
    return true;
  });
  return maximizeX ? envelope.toReversed() : envelope;
}
