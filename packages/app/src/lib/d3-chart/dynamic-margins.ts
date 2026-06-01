import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext';

import { splitLabel, type LabelSplitMode } from './axis-labels';

/** Measure single-line text width using pretext (no DOM reflow). */
export function measureTextWidth(text: string, font: string): number {
  const prepared = prepareWithSegments(text, font);
  let width = 0;
  walkLineRanges(prepared, Infinity, (line) => {
    width = line.width;
  });
  return width;
}

export interface LeftMarginOptions {
  /** How to split labels into rows. Default: 'last-space' */
  split?: LabelSplitMode;
  /** CSS font for the first (or only) row. Default: '600 12px sans-serif' */
  primaryFont?: string;
  /** CSS font for subsequent rows. Default: '10px sans-serif' */
  secondaryFont?: string;
  /** Minimum left margin in px. Default: 60 */
  minMargin?: number;
  /** Extra padding after text in px. Default: 16 */
  padding?: number;
}

/**
 * Compute dynamic left margin for horizontal bar charts based on y-axis label widths.
 * Uses @chenglou/pretext for fast, accurate text measurement without DOM reflow.
 *
 * Supports two split modes:
 * - 'last-space': splits at the last space (for twoRowYAxisLabels)
 * - 'newline': splits on \n (for multi-line eval labels)
 */
export function computeLeftMargin(labels: string[], options: LeftMarginOptions = {}): number {
  const {
    split = 'last-space',
    primaryFont = '600 12px sans-serif',
    secondaryFont = '10px sans-serif',
    minMargin = 60,
    padding = 16,
  } = options;

  let maxWidth = 0;
  for (const label of labels) {
    const [primary, secondary] = splitLabel(label, split);
    maxWidth = Math.max(maxWidth, measureTextWidth(primary, primaryFont));
    if (secondary) {
      maxWidth = Math.max(maxWidth, measureTextWidth(secondary, secondaryFont));
    }
  }
  return Math.max(minMargin, Math.ceil(maxWidth) + padding);
}
