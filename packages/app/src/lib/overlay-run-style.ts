/**
 * Shared helpers for visually differentiating unofficial-run overlay points
 * when more than one run is loaded. Consumed by the inference scatter plot
 * and the evaluation bar chart so both charts apply the same per-run hue.
 */

/** Degrees of hue rotation per run index. 80° per step cycles through 4-5 distinct bands. */
const OVERLAY_HUE_STEP_DEG = 80;

/**
 * CSS `filter` value to apply to an overlay group for a given run index.
 *
 * Returns `null` for index 0 so single-run behavior is unchanged.
 *
 * For index >= 1, we stack `hue-rotate + saturate + brightness`:
 * - `saturate(2.2)` forces saturation up *before* rotating so near-gray base
 *   colors (e.g. when `resolveColor` falls back to `--muted-foreground`) pick
 *   up a visible hue rather than staying gray;
 * - `brightness(1.1)` lifts the result slightly on dark backgrounds.
 *
 * Applied via `style('filter', ...)` — works regardless of whether the
 * underlying stroke color is a CSS variable, oklch, or hex.
 */
export function overlayFilterForRunIndex(idx: number): string | null {
  if (idx <= 0) return null;
  const hue = (idx * OVERLAY_HUE_STEP_DEG) % 360;
  return `saturate(2.2) hue-rotate(${hue}deg) brightness(1.1)`;
}

/**
 * Dash pattern for an overlay roofline at a given run index. Different patterns
 * stack on top of the color filter so runs remain distinguishable even when
 * CSS filters can't produce a hue shift (e.g. pure-gray base strokes).
 */
const ROOFLINE_DASH_BY_RUN = ['6 3', '2 3', '10 3 2 3', '5 3 2 3 2 3', '12 2', '3 1'];
export function overlayRooflineDasharray(runIndex: number): string {
  return ROOFLINE_DASH_BY_RUN[runIndex % ROOFLINE_DASH_BY_RUN.length];
}

/**
 * Resolve a point's run index from its `run_url`. Falls back to parsing
 * the numeric id out of `/runs/<digits>` — needed because `updateRepoUrl`
 * may have rewritten the host/org between the tooltip path and the raw
 * URL stored on the point.
 */
export function overlayRunIndex(
  runUrl: string | null | undefined,
  map: Record<string, number>,
): number {
  if (!runUrl) return 0;
  if (runUrl in map) return map[runUrl];
  const idMatch = runUrl.match(/\/runs\/(\d+)/);
  if (idMatch && idMatch[1] in map) return map[idMatch[1]];
  return 0;
}
