/**
 * The explorer's data-series palettes, defined once. Charts, stacked bars and legend
 * swatches read from here. Chrome (badges, labels, panels, icons) stays neutral and
 * never uses these colors.
 */

/** Token types. Every view that splits tokens by type uses this mapping. */
export const TOKEN_SERIES_COLORS = {
  input: '#0ea5e9',
  cacheRead: '#10b981',
  cacheWrite: '#f59e0b',
  output: '#8b5cf6',
} as const;

export type TokenSeries = keyof typeof TOKEN_SERIES_COLORS;

/** Cycled for open-ended series (models, harness versions, tree branches). */
export const CHART_COLORS = [
  '#0b86d1',
  '#f7b041',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

/** Baseline or remainder series ("regular", "other", "unknown") next to a colored one. */
export const NEUTRAL_SERIES_COLOR = '#9aa3ad';
