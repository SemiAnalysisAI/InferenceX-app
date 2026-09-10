import type { InferenceData } from '@/components/inference/types';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

import { canonicalParetoIntersection } from './canonicalFrontier';
import { scatterPointConfigId } from './point-identity';

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
 * Connect concurrency sweeps only within one dated serving configuration/run.
 * These are operating curves, not optimality claims. Input points are unchanged.
 * Conflicting measurements at one concurrency break a curve rather than invent
 * an ordering between repeated observations; exact duplicate vertices collapse.
 */
export function groupOperatingCurvePoints(
  points: readonly InferenceData[],
): Map<string, InferenceData[]> {
  const groups = new Map<string, InferenceData[]>();
  for (const point of points) {
    if (
      !isFrontierEligible(point) ||
      !Number.isFinite(point.y) ||
      !Number.isFinite(point.conc) ||
      point.conc <= 0
    ) {
      continue;
    }
    const key = JSON.stringify([
      point.date,
      point.run_url ?? null,
      scatterPointConfigId({ ...point, conc: 0 }),
    ]);
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }

  const segments = new Map<string, InferenceData[]>();
  for (const [key, group] of groups) {
    const sorted = group.toSorted((a, b) => a.conc - b.conc || a.x - b.x || a.y - b.y);
    let segment: InferenceData[] = [];
    let segmentIndex = 0;
    const flush = () => {
      if (segment.length > 0) segments.set(`${key}:${segmentIndex++}`, segment);
      segment = [];
    };
    for (let i = 0; i < sorted.length;) {
      const sameConcurrency: InferenceData[] = [];
      const concurrency = sorted[i].conc;
      while (i < sorted.length && sorted[i].conc === concurrency) {
        const point = sorted[i++];
        if (!sameConcurrency.some((other) => other.x === point.x && other.y === point.y)) {
          sameConcurrency.push(point);
        }
      }
      if (sameConcurrency.length === 1) {
        segment.push(sameConcurrency[0]);
      } else {
        flush();
        for (const point of sameConcurrency) {
          segments.set(`${key}:${segmentIndex++}`, [point]);
        }
      }
    }
    flush();
  }
  return segments;
}
