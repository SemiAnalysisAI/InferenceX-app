import type { InferenceData } from '@/components/inference/types';

/**
 * Find the point on a polyline whose x is closest to a target data-space x.
 *
 * Used by the pinned (replay) line-label path: an anchor is stored in data
 * space so a label tracks the same spot along its line as the line animates,
 * instead of jumping between discrete candidate positions on every frame. As
 * the polyline's points shift between frames, resolving the anchor to the
 * nearest current point keeps the label glued to its line.
 *
 * `pts` is assumed non-empty (callers guard with `pts.length >= 2`).
 */
export const pointNearestX = (pts: InferenceData[], targetX: number): InferenceData => {
  let best = pts[0];
  let bestDist = Math.abs(pts[0].x - targetX);
  for (let i = 1; i < pts.length; i++) {
    const dist = Math.abs(pts[i].x - targetX);
    if (dist < bestDist) {
      bestDist = dist;
      best = pts[i];
    }
  }
  return best;
};
