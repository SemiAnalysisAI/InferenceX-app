import type { InferenceData } from '@/components/inference/types';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

import { canonicalParetoIntersection } from './canonicalFrontier';

const POWER_CURVE_METRICS: ReadonlySet<string> = new Set([
  'y_measuredAvgPower',
  'y_measuredP90Power',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPowerPercentTdp',
  'y_modeledChassisPowerPerGpu',
]);

export function isPowerCurveMetric(metric: string): boolean {
  return POWER_CURVE_METRICS.has(metric);
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
  let maxY = -Infinity;
  const envelope = sorted.filter((point) => {
    if (point.y <= maxY) return false;
    maxY = point.y;
    return true;
  });
  return maximizeX ? envelope.toReversed() : envelope;
}
