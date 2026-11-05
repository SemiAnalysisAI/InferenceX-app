import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext';

import { splitLabel, type LabelSplitMode } from './axis-labels';
import type { ChartMargin } from './types';

export function measureTextWidth(text: string, font: string): number {
  const prepared = prepareWithSegments(text, font);
  let width = 0;
  walkLineRanges(prepared, Infinity, (line) => {
    width = line.width;
  });
  return width;
}

export interface LeftMarginOptions {
  split?: LabelSplitMode;
  primaryFont?: string;
  secondaryFont?: string;
  minMargin?: number;
  padding?: number;
}

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
  const radians = (rotation * Math.PI) / 180;
  const verticalSpace = rotation > 0 ? maxWidth * Math.sin(radians) : 0;
  return Math.max(minMargin, Math.ceil(verticalSpace) + padding);
}

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
