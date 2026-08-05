/**
 * @file canonicalFrontier.ts
 * @description Canonical agentic Pareto-frontier helpers.
 *
 * E2E Normalized Interactivity is the agentic "north star" axis. Its true
 * Pareto frontier supplies the canonical eligibility set for every agentic
 * x-axis. Each displayed axis still computes its own true Pareto frontier, and
 * only points that belong to both sets may be drawn as optimal.
 */
import type { DerivedAgenticMetricMap } from '@/hooks/api/use-derived-agentic-metrics';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  type ParetoDirection,
} from '@/lib/chart-utils';

import type { InferenceData } from '../types';

interface ProjectedPoint extends InferenceData {
  canonicalId: number;
}

/**
 * Compute the true Pareto frontier in (E2E Normalized Interactivity, y) space,
 * independently for each (hardware, precision, date) series.
 *
 * `null` means the selected y metric has no declared frontier direction, so
 * callers should retain the chart's normal unrestricted behavior. An empty set
 * means the canonical rule applies but no point has a usable persisted metric.
 */
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

/**
 * Return the intersection of the selected-axis Pareto frontier and the
 * normalized-interactivity frontier when canonical flags are present.
 *
 * The selected-axis frontier must be computed from all eligible points before
 * applying the canonical restriction. Computing Pareto(canonicalPoints) would
 * incorrectly retain a canonical point that is dominated on the selected axis
 * by a non-canonical point.
 *
 * `null` means no canonical restriction was stamped, so the caller should
 * compute its ordinary local Pareto frontier.
 */
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
