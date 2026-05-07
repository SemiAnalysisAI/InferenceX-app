/**
 * Per-step value for a single config. Precomputed in `buildReplayTimeline` so
 * the rAF loop can interpolate without re-scanning calendar history each tick.
 *
 *   - `visible: false` → config has no observation by this step
 *   - `visible: true`  → config has an observation by this step (sticky-last
 *                        carries the value forward through later empty steps)
 */
export interface PerStepValue {
  visible: boolean;
  x: number;
  y: number;
}

export interface InterpolationResult {
  visible: boolean;
  x: number;
  y: number;
}

/**
 * Resolve a config's (x, y, visible) at a logical step index by linearly
 * interpolating between the bracketing per-step values. Step-indexed playback
 * gives every observed date equal screen time and collapses out empty calendar
 * gaps — the visual emphasis lands on actual benchmark events, not calendar
 * months.
 *
 * Visibility transitions:
 *   - both invisible: stays invisible.
 *   - both visible:    lerp x/y by `idxFloat - floor`.
 *   - invisible → visible (config appears in this segment): pop in at the
 *     destination position from the start of the segment so the new dot is
 *     immediately on the frontier instead of dragging across from (0,0).
 *   - visible → invisible (would only occur if a config disappears from the
 *     dataset, which the upstream sticky-last logic prevents): stays at the
 *     last visible value.
 */
export function interpolateAtStep(
  stepValues: readonly PerStepValue[],
  idxFloat: number,
): InterpolationResult {
  const n = stepValues.length;
  if (n === 0) return { visible: false, x: 0, y: 0 };

  const clamped = Math.max(0, Math.min(n - 1, idxFloat));
  const idxLow = Math.min(n - 1, Math.floor(clamped));
  const idxHigh = Math.min(n - 1, idxLow + 1);
  const a = stepValues[idxLow];
  const b = stepValues[idxHigh];

  if (idxLow === idxHigh) return { visible: a.visible, x: a.x, y: a.y };

  if (!a.visible && !b.visible) return { visible: false, x: 0, y: 0 };
  if (a.visible && !b.visible) return { visible: true, x: a.x, y: a.y };
  if (!a.visible && b.visible) return { visible: true, x: b.x, y: b.y };

  const frac = clamped - idxLow;
  return {
    visible: true,
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
  };
}
