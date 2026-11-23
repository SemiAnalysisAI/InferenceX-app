import { useSyncExternalStore } from 'react';

import { splitLabel, type LabelSplitMode } from './axis-labels';
import type { ChartMargin } from './types';

export interface TextMeasureOptions {
  /** `normal` collapses white space like SVG text. `pre-wrap` keeps it, as a pill's tspans do. */
  whiteSpace?: 'normal' | 'pre-wrap';
}

const widthCache = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function textContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (measureContext) return measureContext;
  const context =
    typeof OffscreenCanvas === 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : new OffscreenCanvas(1, 1).getContext('2d');
  if (!context) throw new Error('Text measurement needs a 2D canvas context.');
  measureContext = context;
  return context;
}

/**
 * The text of the last line the browser would lay out without a width limit. `normal` white
 * space collapses each run of spaces, tabs and line breaks into one space and drops the space at
 * either edge of the line. `pre-wrap` keeps every space and breaks only at line feeds.
 */
function lastLine(text: string, whiteSpace: TextMeasureOptions['whiteSpace']): string {
  if (whiteSpace !== 'pre-wrap') {
    return text
      .replaceAll(/[\t\n\f\r ]+/gu, ' ')
      .replace(/^ /u, '')
      .replace(/ $/u, '');
  }
  return text
    .replaceAll(/\r\n?|\f/gu, '\n')
    .replace(/\n$/u, '')
    .split('\n')
    .at(-1)!;
}

/** Width in px of `text` set in the CSS `font`, measured on a canvas and cached per font. */
export function measureTextWidth(text: string, font: string, options?: TextMeasureOptions): number {
  const key = `${options?.whiteSpace ?? ''}\n${font}\n${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;
  const context = textContext();
  context.font = font;
  const width = context.measureText(lastLine(text, options?.whiteSpace)).width;
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
    primaryFont = '500 12px sans-serif',
    secondaryFont = '12px sans-serif',
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
