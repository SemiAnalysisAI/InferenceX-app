import {
  clearCache,
  prepareWithSegments,
  walkLineRanges,
  type PrepareOptions,
} from '@chenglou/pretext';
import { useSyncExternalStore } from 'react';

import { splitLabel, type LabelSplitMode } from './axis-labels';
import type { ChartMargin } from './types';

const widthCache = new Map<string, number>();

export function measureTextWidth(text: string, font: string, options?: PrepareOptions): number {
  const key = `${options?.whiteSpace ?? ''}\n${font}\n${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const prepared = prepareWithSegments(text, font, options);
  let width = 0;
  walkLineRanges(prepared, Infinity, (line) => {
    width = line.width;
  });
  if (widthCache.size >= 4096) widthCache.clear();
  widthCache.set(key, width);
  return width;
}

export function chartFont(sizePx: number, weight: number | string = 400, family?: string): string {
  const style = getComputedStyle(document.body);
  const resolved =
    family?.replaceAll(
      /var\((?<name>--[\w-]+)(?:,\s*(?<fallback>[^)]*))?\)/gu,
      (_, name: string, fallback?: string) =>
        style.getPropertyValue(name).trim() || fallback || 'sans-serif',
    ) ?? style.fontFamily;
  return `${weight} ${sizePx}px ${resolved}`;
}

function countLoadedFaces(): number {
  let loaded = 0;
  for (const face of document.fonts) if (face.status === 'loaded') loaded++;
  return loaded;
}

let fontsVersion = 0;
const fontListeners = new Set<() => void>();
if (typeof document !== 'undefined' && document.fonts) {
  let loadedFaces = countLoadedFaces();
  document.fonts.addEventListener('loadingdone', () => {
    // Chrome fires loadingdone on every resize; only a newly loaded face changes widths.
    const loaded = countLoadedFaces();
    if (loaded === loadedFaces) return;
    loadedFaces = loaded;
    clearCache();
    widthCache.clear();
    fontsVersion++;
    for (const listener of fontListeners) listener();
  });
}

function subscribeFonts(listener: () => void) {
  fontListeners.add(listener);
  return () => fontListeners.delete(listener);
}

export function useFontsVersion(): number {
  return useSyncExternalStore(
    subscribeFonts,
    () => fontsVersion,
    () => 0,
  );
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
