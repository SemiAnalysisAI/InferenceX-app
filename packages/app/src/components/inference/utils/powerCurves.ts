import { isPowerBasisConfigKey } from '@/components/inference/metric-registry';
import type { InferenceData } from '@/components/inference/types';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  paretoMaximizesX,
  type ParetoDirection,
} from '@/lib/charts/chart-utils';

import { canonicalParetoIntersection } from './canonicalFrontier';

const POWER_CURVE_METRICS: ReadonlySet<string> = new Set([
  'y_measuredAvgPower',
  'y_measuredP75Power',
  'y_measuredP90Power',
  'y_measuredPrefillAvgPower',
  'y_measuredDecodeAvgPower',
  'y_measuredPowerPercentTdp',
  'y_utilityModeledWatts',
]);

export function isPowerCurveMetric(metric: string): boolean {
  return POWER_CURVE_METRICS.has(metric);
}

export function isPowerGaugeSeries(metric: string, sample: InferenceData | undefined): boolean {
  const variant = sample?.powerVariant;
  if (variant) return variant.kind === 'basis' && variant.id !== 'gpu-measured';
  return isPowerBasisConfigKey(metric);
}

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

export function upperPowerEnvelope(
  points: readonly InferenceData[],
  direction: ParetoDirection,
  keepTies = false,
): InferenceData[] {
  const maximizeX = paretoMaximizesX(direction);
  const sorted = points
    .filter((point) => isFrontierEligible(point) && Number.isFinite(point.y) && point.y > 0)
    .sort((a, b) => (maximizeX ? b.x - a.x : a.x - b.x) || b.y - a.y);
  let maxY = -Infinity;
  let lastX = Number.NaN;
  const envelope = sorted.filter((point) => {
    if (point.y < maxY || (point.y === maxY && (!keepTies || point.x === lastX))) return false;
    maxY = point.y;
    lastX = point.x;
    return true;
  });
  return maximizeX ? envelope.toReversed() : envelope;
}
