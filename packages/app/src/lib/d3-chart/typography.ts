/**
 * Shared chart typography constants.
 *
 * Chart text is sized in TypeScript, not CSS custom properties, on purpose:
 * the PNG export path (useChartExport) serializes the chart subtree with
 * html-to-image, which cannot resolve `var(--*)` references, and its
 * resolveCssVarsForExport() only bakes color-type presentation attributes
 * (fill/stroke/etc.), not font-size. A `font-size: var(--…)` would silently
 * collapse in exported images. Keep sizes here and interpolate px strings.
 *
 * OG-image renderers (Satori: opengraph-image.tsx, og-image-render.tsx,
 * compare-og.tsx) are a separate fixed-canvas world and intentionally do not
 * use these constants.
 */
export const CHART_TYPE = {
  /** Axis titles (x-axis-label / y-axis-label) and axis tick primary rows. */
  axisLabel: 12,
  /** Secondary (muted) row of two-row axis labels. */
  axisLabelSub: 10,
  /** In-plot annotation text, first line. */
  annotation: 11,
  /** In-plot annotation text, secondary line. */
  annotationSub: 10,
  /** Small labels attached to marks (points, radar vertices, rulers). */
  dataLabel: 10,
  /** Smallest legible size, for dense diagram labels. */
  micro: 9,
  /** Unofficial-results watermark pattern text. */
  watermark: 20,
} as const;

/** Format a CHART_TYPE size as a CSS px string for .attr('font-size', …). */
export function px(size: number): string {
  return `${size}px`;
}

/**
 * Font stacks used when charts are rendered to a PNG. Shared with the export
 * path so chart layers and useChartExport cannot drift apart.
 */
export const CHART_FONT_SANS =
  'var(--font-dm-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const CHART_FONT_MINECRAFT = 'var(--font-minecraft), "Monocraft", monospace';
