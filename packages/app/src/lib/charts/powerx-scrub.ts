/**
 * PowerX touch scrub on the main scatter: a finger dragged across the plot snaps
 * to the plotted point nearest it, official or `?unofficialrun=` overlay, and
 * the readout above the chart reads that point instead of a hover tooltip.
 */
export interface ScrubCandidate<T> {
  point: T;
  /** Plot-space position of the point under the current zoom. */
  x: number;
  y: number;
  /** True for an unofficial-run overlay point (drawn in its run colour). */
  overlay: boolean;
}

/**
 * The candidate nearest the finger in plot pixels, Euclidean; ties keep the
 * earlier candidate (official points are listed before overlay ones).
 */
export function nearestScrubCandidate<T>(
  candidates: readonly ScrubCandidate<T>[],
  x: number,
  y: number,
): ScrubCandidate<T> | null {
  let best: ScrubCandidate<T> | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) continue;
    const distance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
