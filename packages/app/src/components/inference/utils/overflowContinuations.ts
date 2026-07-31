import { paretoFrontForDirection, type ParetoDirection } from '@/lib/chart-utils';

import type { ClippedInferenceData, InferenceData } from '../types';
import { e2eRestrictedSeed } from './e2eFrontier';

export interface FrontierContinuation {
  from: InferenceData;
  toward: InferenceData;
  reasons: ClippedInferenceData['reasons'];
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
 * point into an intentionally clipped point. A single visible point can yield
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
    result.push({ from, toward, reasons: clippedEntry.reasons });
  }

  return result;
}

/**
 * Project a data-space continuation ray to the plot boundary. The endpoint is
 * inset slightly so the arrowhead remains inside the chart clip path.
 */
export function projectContinuationToBounds(
  continuation: Pick<FrontierContinuation, 'from' | 'toward'>,
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  width: number,
  height: number,
  inset = 7,
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

  const boundaryX = x1 + dx * boundaryT;
  const boundaryY = y1 + dy * boundaryT;
  const unitX = dx / length;
  const unitY = dy / length;

  return {
    x1,
    y1,
    x2: boundaryX - unitX * inset,
    y2: boundaryY - unitY * inset,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
