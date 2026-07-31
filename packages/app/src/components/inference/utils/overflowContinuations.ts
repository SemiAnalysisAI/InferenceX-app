import { paretoFrontForDirection, type ParetoDirection } from '@/lib/chart-utils';

import type { ClippedInferenceData, InferenceData } from '../types';
import { e2eRestrictedSeed } from './e2eFrontier';

export interface FrontierContinuation {
  from: InferenceData;
  toward: InferenceData;
  points: InferenceData[];
  reasons: ClippedInferenceData['reasons'];
  hiddenPointCount: number;
}

/**
 * Find transitions where a complete Pareto frontier crosses from a visible
 * point into an intentionally clipped run. A single visible point can yield
 * two continuations when hidden frontier points exist on both sides.
 */
export function buildFrontierContinuations(
  visible: InferenceData[],
  clipped: ClippedInferenceData[],
  direction: ParetoDirection,
): FrontierContinuation[] {
  if (visible.length === 0 || clipped.length === 0) return [];

  const visibleSet = new Set(visible);
  const clippedByPoint = new Map(clipped.map((entry) => [entry.point, entry]));
  const allPoints = [...visible, ...clipped.map((entry) => entry.point)];
  const frontier = paretoFrontForDirection(direction)(e2eRestrictedSeed(allPoints)).toSorted(
    (a, b) => a.x - b.x,
  );
  const result: FrontierContinuation[] = [];

  for (let index = 0; index < frontier.length - 1; index++) {
    const left = frontier[index];
    const right = frontier[index + 1];
    const leftVisible = visibleSet.has(left);
    const rightVisible = visibleSet.has(right);
    if (leftVisible === rightVisible) continue;

    const from = leftVisible ? left : right;
    const toward = leftVisible ? right : left;
    const clippedEntry = clippedByPoint.get(toward);
    if (!clippedEntry) continue;

    const step = leftVisible ? 1 : -1;
    let cursor = leftVisible ? index + 1 : index;
    const reasons = new Set<ClippedInferenceData['reasons'][number]>();
    const hiddenPoints: InferenceData[] = [];
    while (cursor >= 0 && cursor < frontier.length && !visibleSet.has(frontier[cursor])) {
      const hiddenPoint = frontier[cursor];
      hiddenPoints.push(hiddenPoint);
      const hiddenEntry = clippedByPoint.get(hiddenPoint);
      if (hiddenEntry) {
        hiddenEntry.reasons.forEach((reason) => reasons.add(reason));
      }
      cursor += step;
    }
    const hiddenPointCount = clipped.filter((entry) =>
      entry.reasons.some((reason) => reasons.has(reason)),
    ).length;

    const controlIndex = leftVisible ? index - 1 : index + 2;
    const controlPoint = frontier[controlIndex];
    const points =
      controlPoint && visibleSet.has(controlPoint)
        ? [controlPoint, from, ...hiddenPoints]
        : [from, ...hiddenPoints];

    result.push({
      from,
      toward,
      points,
      reasons: [...reasons],
      hiddenPointCount,
    });
  }

  return result;
}
