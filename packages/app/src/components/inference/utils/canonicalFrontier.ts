import type { DerivedAgenticMetricMap } from '@/hooks/api/use-derived-agentic-metrics';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/charts/chart-utils';

import type { InferenceData } from '../types';

interface ProjectedPoint extends InferenceData {
  canonicalId: number;
}

export function canonicalNormalizedFrontierIds(
  points: InferenceData[],
  derivedMetrics: DerivedAgenticMetricMap,
  percentile: string,
  direction: ParetoDirection | undefined,
): Set<number> | null {
  if (!direction) return null;

  const byGroup = new Map<string, ProjectedPoint[]>();
  for (const point of points) {
    if (!isPersistedBenchmarkId(point.id)) continue;
    const metric = derivedMetrics[point.id];
    const normalizedX =
      percentile === 'p75' ? metric?.p75_e2e_norm_intvty : metric?.p90_e2e_norm_intvty;
    if (typeof normalizedX !== 'number' || !Number.isFinite(normalizedX) || normalizedX <= 0) {
      continue;
    }
    if (typeof point.y !== 'number' || !Number.isFinite(point.y)) continue;

    const groupKey = `${point.hwKey}|${point.precision}|${point.date}`;
    let group = byGroup.get(groupKey);
    if (!group) {
      group = [];
      byGroup.set(groupKey, group);
    }
    group.push({ ...point, x: normalizedX, canonicalId: point.id });
  }

  const winners = new Set<number>();
  const frontier = paretoFrontForDirection(direction);
  for (const group of byGroup.values()) {
    for (const point of frontier(group.filter(isFrontierEligible))) {
      winners.add((point as ProjectedPoint).canonicalId);
    }
  }
  return winners;
}

export function canonicalParetoIntersection(
  points: InferenceData[],
  direction: ParetoDirection,
): InferenceData[] | null {
  const isCanonical = points.some(
    (point) => point.isOnNormalizedInteractivityFrontier !== undefined,
  );
  if (!isCanonical) return null;
  const selectedAxisFrontier = paretoFrontForDirection(direction)(
    points.filter(isFrontierEligible),
  );
  return selectedAxisFrontier.filter((point) => point.isOnNormalizedInteractivityFrontier === true);
}
