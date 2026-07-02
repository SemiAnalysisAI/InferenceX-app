/**
 * Pure math behind the cursor stats popover: count how many requests are
 * running / waiting / completed at a given instant, in O(log n) per query via
 * binary search over pre-sorted timestamp columns.
 */

/** Pre-sorted (ascending) timestamp columns for one filtered request set. */
export interface SortedRequestTimes {
  credits: number[];
  starts: number[];
  ends: number[];
}

export interface CursorStats {
  running: number;
  waiting: number;
  completed: number;
  inflight: number;
}

/** Number of values in a sorted ascending array that are <= target. */
export function countLeq(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Number of values in a sorted ascending array that are < target. */
export function countLt(sorted: number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Request counts at time t (ns offset on the same axis as the sorted columns):
 *   running   = #(start <= t) - #(end < t)
 *   waiting   = #(credit <= t) - #(start <= t)
 *   completed = #(end <= t)
 */
export function cursorStatsAt(times: SortedRequestTimes, t: number): CursorStats {
  const startsLeq = countLeq(times.starts, t);
  const running = Math.max(0, startsLeq - countLt(times.ends, t));
  const waiting = Math.max(0, countLeq(times.credits, t) - startsLeq);
  const completed = countLeq(times.ends, t);
  return { running, waiting, completed, inflight: running + waiting };
}
