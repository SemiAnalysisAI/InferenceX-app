/**
 * Shared 2-D Pareto-frontier utilities for both "higher y is better" and
 * "lower y is better" curves over an x-axis where higher x is always better
 * (e.g. interactivity tok/s/user — more is more responsive).
 *
 * The chart layer has its own metric-aware helpers (calculateRoofline et al)
 * that operate on full InferenceData points and `upper_left | upper_right | …`
 * directions. This module is the plain numeric core — it works on
 * `{ x, y }`-shaped points and is what tables / non-chart consumers should use.
 *
 * Direction parameter:
 *   - 'higher' (default): a point dominates iff x and y are BOTH greater. The
 *     visible frontier on an interactivity vs throughput chart looks like
 *     "upper-left" because as concurrency rises x falls while y rises.
 *   - 'lower': a point dominates iff x is greater AND y is LOWER. Used for
 *     cost / J / power metrics where less is more.
 *
 * Sorting note: the frontier is always returned in ascending-x order so
 * downstream interp/AUC can treat the xs as a sorted grid.
 */

export interface Point2D {
  x: number;
  y: number;
}

export type ParetoDirection = 'higher' | 'lower';

/**
 * Pareto frontier with direction control. Returns non-dominated points sorted
 * by ascending x.
 *
 * For 'higher': a point is kept when no other has BOTH greater x AND greater y.
 * For 'lower':  a point is kept when no other has greater x AND LESSER y.
 */
export function paretoFrontier<T extends Point2D>(
  points: readonly T[],
  direction: ParetoDirection = 'higher',
): T[] {
  if (points.length === 0) return [];
  // Sort by descending x. The point with max x is always kept; then walk down
  // and keep any point whose y "beats" the running best y (max for 'higher',
  // min for 'lower').
  const sorted = [...points].toSorted((a, b) => b.x - a.x);
  const front: T[] = [];
  if (direction === 'higher') {
    let maxY = -Infinity;
    for (const p of sorted) {
      if (p.y > maxY) {
        front.push(p);
        maxY = p.y;
      }
    }
  } else {
    let minY = Infinity;
    for (const p of sorted) {
      if (p.y < minY) {
        front.push(p);
        minY = p.y;
      }
    }
  }
  // Return ascending x for downstream consumers.
  return front.toSorted((a, b) => a.x - b.x);
}

/**
 * Linear interpolation along a frontier that's already sorted by ascending x.
 * Returns null when x is outside [minX, maxX] of the frontier.
 *
 * Direction does not change the interpolation math — it only changes which
 * vertex's y wins at duplicate-x ties (we pick whichever is "best" in the
 * given direction).
 */
export function interpAlongFrontier(
  frontier: readonly Point2D[],
  x: number,
  direction: ParetoDirection = 'higher',
): number | null {
  const last = frontier.at(-1);
  if (frontier.length === 0 || !last) return null;
  const minX = frontier[0].x;
  const maxX = last.x;
  if (x < minX || x > maxX) return null;
  if (frontier.length === 1) return frontier[0].y;
  // Binary-search insertion point.
  let lo = 0;
  let hi = frontier.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (frontier[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = frontier[lo];
  const b = frontier[hi];
  if (b.x === a.x) return direction === 'higher' ? Math.max(a.y, b.y) : Math.min(a.y, b.y);
  const t = (x - a.x) / (b.x - a.x);
  return a.y + t * (b.y - a.y);
}

/**
 * Trapezoidal AUC under the linearly-interpolated frontier between [lo, hi].
 *
 * Out-of-range semantics depend on direction:
 *   - 'higher': outside the frontier's x-range y is treated as 0 (worst case
 *     for higher-is-better — a config that doesn't reach that interactivity
 *     contributes 0). Matches the original behavior / spec.
 *   - 'lower':  integrate ONLY over each config's reachable x-range. Treating
 *     out-of-range as 0 would inflate AUC because 0 is the BEST value for
 *     cost / J / power metrics — that's the opposite of what we want. Using
 *     "worst observed value" outside the range would penalize configs with
 *     short reachable spans more than necessary; restricting integration to
 *     the reachable window is the simplest interpretable choice and matches
 *     the natural reading "average value over what the config can actually
 *     do, scaled by the span it covers". Consumers should display the
 *     effective window so smaller-coverage configs can be spotted.
 *
 * Closed-form rather than 10 001-sample grid — same answer to machine
 * precision because the integrand is piecewise-linear, and avoids allocating
 * arrays on every render.
 */
export function aucUnderFrontier(
  frontier: readonly Point2D[],
  lo: number,
  hi: number,
  direction: ParetoDirection = 'higher',
): number {
  const last = frontier.at(-1);
  if (frontier.length === 0 || !last || hi <= lo) return 0;
  const minX = frontier[0].x;
  const maxX = last.x;
  const effLo = Math.max(lo, minX);
  const effHi = Math.min(hi, maxX);
  if (effHi <= effLo) return 0;

  if (direction === 'higher') {
    // Build the integration breakpoints: clip the frontier vertices to
    // [effLo, effHi] and add the boundaries. Outside the frontier's x-range
    // we want y=0; that's already handled because the integration range is
    // clipped to [effLo, effHi] (a strict sub-range of the frontier span).
    // The original [lo, hi] outside-frontier region contributes 0 because
    // the integrand is 0 there.
    const xs: number[] = [effLo];
    for (const p of frontier) {
      if (p.x > effLo && p.x < effHi) xs.push(p.x);
    }
    xs.push(effHi);

    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const y0 = interpAlongFrontier(frontier, x0, direction) ?? 0;
      const y1 = interpAlongFrontier(frontier, x1, direction) ?? 0;
      area += ((y0 + y1) / 2) * (x1 - x0);
    }
    return area;
  }

  // direction === 'lower': integrate only over the reachable x-range. No
  // padding outside [minX, maxX]; the effective window IS [effLo, effHi].
  const xs: number[] = [effLo];
  for (const p of frontier) {
    if (p.x > effLo && p.x < effHi) xs.push(p.x);
  }
  xs.push(effHi);

  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const y0 = interpAlongFrontier(frontier, x0, direction) ?? 0;
    const y1 = interpAlongFrontier(frontier, x1, direction) ?? 0;
    area += ((y0 + y1) / 2) * (x1 - x0);
  }
  return area;
}

/**
 * Effective AUC integration window for a single frontier given a requested
 * [lo, hi]. For 'higher' the window is always [lo, hi] (zero-pad outside).
 * For 'lower' the window is clipped to the frontier's reachable span so
 * callers can label which range was actually integrated.
 */
export function aucWindow(
  frontier: readonly Point2D[],
  lo: number,
  hi: number,
  direction: ParetoDirection = 'higher',
): { lo: number; hi: number } | null {
  const last = frontier.at(-1);
  if (frontier.length === 0 || !last || hi <= lo) return null;
  if (direction === 'higher') return { lo, hi };
  const minX = frontier[0].x;
  const maxX = last.x;
  const effLo = Math.max(lo, minX);
  const effHi = Math.min(hi, maxX);
  if (effHi <= effLo) return null;
  return { lo: effLo, hi: effHi };
}
