import { paretoFrontForDirection, type ParetoDirection } from '@/lib/chart-utils';

import type { ClippedInferenceData, InferenceData } from '../types';
import { e2eRestrictedSeed } from './e2eFrontier';

export interface FrontierContinuation {
  from: InferenceData;
  toward: InferenceData;
  reasons: ClippedInferenceData['reasons'];
  hiddenPointCount: number;
}

export interface ProjectedContinuation {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
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
    while (cursor >= 0 && cursor < frontier.length && !visibleSet.has(frontier[cursor])) {
      const hiddenEntry = clippedByPoint.get(frontier[cursor]);
      if (hiddenEntry) {
        hiddenEntry.reasons.forEach((reason) => reasons.add(reason));
      }
      cursor += step;
    }
    const hiddenPointCount = clipped.filter((entry) =>
      entry.reasons.some((reason) => reasons.has(reason)),
    ).length;

    result.push({
      from,
      toward,
      reasons: [...reasons],
      hiddenPointCount,
    });
  }

  return result;
}

/**
 * Project a data-space continuation toward the next clipped Pareto point.
 * The segment is capped in screen space so a distant outlier cannot create a
 * line across the whole chart. If the plot boundary is closer, the endpoint
 * is inset slightly so the arrowhead remains inside the clip path.
 */
export function projectContinuationToBounds(
  continuation: Pick<FrontierContinuation, 'from' | 'toward'>,
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  width: number,
  height: number,
  inset = 7,
  maxLength = 96,
): ProjectedContinuation | null {
  const x1 = xScale(continuation.from.x);
  const y1 = yScale(continuation.from.y);
  const targetX = xScale(continuation.toward.x);
  const targetY = yScale(continuation.toward.y);
  if (![x1, y1, targetX, targetY].every(Number.isFinite)) return null;
  if (x1 < 0 || x1 > width || y1 < 0 || y1 > height) return null;

  const dx = targetX - x1;
  const dy = targetY - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const candidates: number[] = [];
  if (dx > 0) candidates.push((width - x1) / dx);
  else if (dx < 0) candidates.push((0 - x1) / dx);
  if (dy > 0) candidates.push((height - y1) / dy);
  else if (dy < 0) candidates.push((0 - y1) / dy);
  const boundaryT = Math.min(...candidates.filter((value) => value > 0));
  if (!Number.isFinite(boundaryT)) return null;

  const unitX = dx / length;
  const unitY = dy / length;
  const boundaryDistance = length * boundaryT;
  const segmentLength = Math.min(maxLength, boundaryDistance - inset);
  if (segmentLength <= 0) return null;

  return {
    x1,
    y1,
    x2: x1 + unitX * segmentLength,
    y2: y1 + unitY * segmentLength,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
