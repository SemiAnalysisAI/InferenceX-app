import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext';

import { splitLabel, type LabelSplitMode } from './axis-labels';
import type { ChartMargin } from './types';

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

/**
 * Compute dynamic bottom margin based on x-axis tick label widths.
 * Useful when tick labels are rotated (e.g. dates at -30deg).
 *
 * @param labels - X-axis tick label strings
 * @param font - CSS font string for tick labels (default '12px sans-serif')
 * @param rotation - Label rotation in degrees (default 0, use 30 for rotated dates)
 * @param minMargin - Minimum bottom margin (default 40)
 * @param padding - Extra padding (default 16)
 */
export function computeBottomMargin(
  labels: string[],
  font = '12px sans-serif',
  rotation = 0,
  minMargin = 40,
  padding = 16,
): number {
  let maxWidth = 0;
  for (const label of labels) {
    maxWidth = Math.max(maxWidth, measureTextWidth(label, font));
  }
  // When rotated, the vertical space needed is width * sin(angle)
  const radians = (rotation * Math.PI) / 180;
  const verticalSpace = rotation > 0 ? maxWidth * Math.sin(radians) : 0;
  return Math.max(minMargin, Math.ceil(verticalSpace) + padding);
}

/**
 * Compute a full ChartMargin with dynamic left and bottom based on label content.
 *
 * @param options.yLabels - Y-axis labels for left margin computation
 * @param options.xLabels - X-axis labels for bottom margin computation
 * @param options.xFont - CSS font for x-axis labels
 * @param options.xRotation - X-axis label rotation in degrees
 * @param options.base - Base margins to start from
 */
export function computeDynamicMargins(options: {
  yLabels?: string[];
  xLabels?: string[];
  xFont?: string;
  xRotation?: number;
  base?: Partial<ChartMargin>;
}): ChartMargin {
  const { yLabels, xLabels, xFont, xRotation = 0, base = {} } = options;
  return {
    top: base.top ?? 24,
    right: base.right ?? 24,
    bottom: xLabels
      ? computeBottomMargin(xLabels, xFont, xRotation, base.bottom ?? 40)
      : (base.bottom ?? 40),
    left: yLabels ? computeLeftMargin(yLabels, { minMargin: base.left ?? 60 }) : (base.left ?? 60),
  };
}
