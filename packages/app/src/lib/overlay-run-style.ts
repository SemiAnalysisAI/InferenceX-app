/**
 * Shared helpers for visually differentiating unofficial-run overlay points
 * when one or more runs are loaded. Consumed by the inference scatter plot
 * and the evaluation bar chart.
 *
 * Design: instead of applying a CSS filter to an hwKey-derived base color
 * (which is brittle — `hue-rotate` on gray is a no-op, and filter output
 * can't be re-used in legend swatches that style `background-color` directly),
 * we assign each run a fixed palette color. The same palette is used by the
 * chart strokes AND the legend entries, so they always match visually.
 *
 * Trade-off: overlay points no longer encode hardware via color. Hardware is
 * still identifiable via the X-mark shape, the point label (TP number or
 * advanced label), and the tooltip.
 */

/**
 * Palette for overlay runs, in load-order. Tuned for dark mode primarily but
 * readable on light backgrounds too. Each entry is a saturated OKLch string
 * so it shows even when the underlying theme colors are muted.
 */
const RUN_PALETTE: readonly string[] = [
  'oklch(0.72 0.22 25)', // warm red
  'oklch(0.75 0.20 190)', // teal
  'oklch(0.78 0.20 90)', // amber
  'oklch(0.70 0.22 290)', // violet
  'oklch(0.75 0.20 150)', // green
  'oklch(0.70 0.22 330)', // magenta
  'oklch(0.72 0.20 230)', // blue
  'oklch(0.78 0.18 60)', // yellow-orange
];

/** Return the palette color for a given run index (wraps on overflow). */
export function overlayRunColor(runIndex: number): string {
  return RUN_PALETTE[((runIndex % RUN_PALETTE.length) + RUN_PALETTE.length) % RUN_PALETTE.length];
}

/**
 * Dash pattern for an overlay roofline at a given run index. Layered on top
 * of the per-run color so runs stay distinguishable even on grayscale
 * screenshots or print.
 */
const ROOFLINE_DASH_BY_RUN: readonly string[] = [
  '6 3',
  '2 3',
  '10 3 2 3',
  '5 3 2 3 2 3',
  '12 2',
  '3 1',
];
export function overlayRooflineDasharray(runIndex: number): string {
  return ROOFLINE_DASH_BY_RUN[
    ((runIndex % ROOFLINE_DASH_BY_RUN.length) + ROOFLINE_DASH_BY_RUN.length) %
      ROOFLINE_DASH_BY_RUN.length
  ];
}

/**
 * Resolve a point's run index from its `run_url`. Falls back to parsing the
 * numeric id out of `/runs/<digits>` — needed because `updateRepoUrl` may
 * rewrite the host/org between the raw URL stored on the point and the
 * lookup map constructed from run metadata.
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
