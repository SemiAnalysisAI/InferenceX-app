import type { InferenceData } from '../types';
import {
  equalServiceSourceKey,
  observedPoints,
  positiveOrNull,
  serviceMetricValue,
} from './equal-service-comparison';

/** Measured GPU metrics the Table view can express as a difference from a baseline source. */
const POWER_BASELINE_METRICS = {
  y_measuredAvgPower: 'meanWattsPerGpu',
  y_measuredJPerOutputToken: 'joulesPerOutputToken',
} as const;
export type PowerBaselineMetric =
  (typeof POWER_BASELINE_METRICS)[keyof typeof POWER_BASELINE_METRICS];

export function powerBaselineMetric(selectedYAxisMetric: string): PowerBaselineMetric | null {
  return Object.hasOwn(POWER_BASELINE_METRICS, selectedYAxisMetric)
    ? POWER_BASELINE_METRICS[selectedYAxisMetric as keyof typeof POWER_BASELINE_METRICS]
    : null;
}

export type PowerBaselineDelta =
  | { status: 'observed'; value: number; percent: number }
  /** The row belongs to the baseline source. */
  | { status: 'baseline' }
  /** Unmeasured or conflicting baseline reading at this load, or a comparison clone. */
  | { status: 'unavailable' };

/**
 * Each row's measured reading minus the baseline source's reading at the same
 * concurrency — the Overview reference pattern applied to the Table view.
 * Nothing is interpolated: a load the baseline never ran, or ran with
 * disagreeing readings, has no delta. Same-speed comparisons stay with the
 * chart's Perf Ruler.
 */
export function powerBaselineDeltas(
  points: readonly InferenceData[],
  baselineKey: string,
  metric: PowerBaselineMetric,
): Map<InferenceData, PowerBaselineDelta> {
  const read = serviceMetricValue[metric];
  // null marks a load whose repeated baseline readings disagree.
  const baselineByLoad = new Map<number, number | null>();
  for (const point of observedPoints(points)) {
    if (equalServiceSourceKey(point) !== baselineKey) continue;
    const value = positiveOrNull(read(point));
    if (value === null) continue;
    const seen = baselineByLoad.get(point.conc);
    baselineByLoad.set(point.conc, seen === undefined || seen === value ? value : null);
  }
  return new Map(
    points.map((point): [InferenceData, PowerBaselineDelta] => {
      if (point.powerVariant) return [point, { status: 'unavailable' }];
      if (equalServiceSourceKey(point) === baselineKey) return [point, { status: 'baseline' }];
      const base = baselineByLoad.get(point.conc);
      const value = positiveOrNull(read(point));
      if (base === undefined || base === null || value === null) {
        return [point, { status: 'unavailable' }];
      }
      return [
        point,
        { status: 'observed', value: value - base, percent: (100 * (value - base)) / base },
      ];
    }),
  );
}
