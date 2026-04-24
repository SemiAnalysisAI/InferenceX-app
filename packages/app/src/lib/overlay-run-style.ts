/**
 * Shared helpers for visually differentiating unofficial-run overlay points
 * when more than one run is loaded. Consumed by the inference scatter plot
 * and the evaluation bar chart so both charts apply the same per-run hue.
 */

/** Degrees of hue rotation per run index. Tuned so that up to ~6 runs stay distinguishable. */
const OVERLAY_HUE_STEP_DEG = 55;

/**
 * CSS `filter` value to apply to an overlay group for a given run index.
 * Returns `null` for index 0 so single-run behavior is unchanged and no
 * filter is added to the SVG (keeps it out of the GPU compositing path
 * in the common case).
 */
export function overlayFilterForRunIndex(idx: number): string | null {
  if (idx <= 0) return null;
  const hue = (idx * OVERLAY_HUE_STEP_DEG) % 360;
  return `hue-rotate(${hue}deg) saturate(1.2)`;
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
