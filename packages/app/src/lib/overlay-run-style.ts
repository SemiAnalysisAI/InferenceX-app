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
 * Number of entries in the overlay-run palette. The actual color values are
 * theme-aware CSS custom properties defined in `globals.css` as
 * `--overlay-run-0` .. `--overlay-run-<N-1>`; light mode uses darker/saturated
 * hues for contrast on a light background, dark/minecraft modes use the
 * lighter hues this file used to hard-code.
 */
const RUN_PALETTE_SIZE = 8;

/**
 * Return the palette color for a given run index (wraps on overflow).
 * Resolves to a theme-aware CSS variable so charts + legend swatches restain
 * automatically when the user toggles light/dark.
 */
export function overlayRunColor(runIndex: number): string {
  const slot = ((runIndex % RUN_PALETTE_SIZE) + RUN_PALETTE_SIZE) % RUN_PALETTE_SIZE;
  return `var(--overlay-run-${slot})`;
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
  const idMatch = runUrl.match(/\/runs\/(\d+)/u);
  if (idMatch && idMatch[1] in map) return map[idMatch[1]];
  return 0;
}
