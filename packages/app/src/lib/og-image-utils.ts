/**
 * Shared utilities for OG / social-image route handlers.
 *
 * All consumers run under the Next.js nodejs runtime (never edge), so
 * node:fs/promises is available everywhere this module is imported.
 *
 * Design constraints:
 * - loadImageAsDataUri is memoised per-path with a module-level Map of
 *   Promises so that repeated requests within a process lifetime pay the
 *   file-read cost only once (same semantics as the per-variable promise
 *   singletons the callers previously used).
 * - Axis-nicing helpers are pure functions — no side effects, no I/O.
 * - Text-layout helpers are pure functions parameterised on the same
 *   constants the call sites already use, so extraction is byte-identical.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

const _imageCache = new Map<string, Promise<string | null>>();

/**
 * Load a file from the Next.js `public/` directory and return it as a
 * base64 data-URI suitable for use in `<img src>` inside ImageResponse.
 *
 * The result is cached in a module-level Map so the same path is only read
 * once per process — identical to the per-variable promise singletons that
 * the individual call sites previously used.
 *
 * Returns `null` if the file cannot be read (missing asset must not 500 a
 * route).
 *
 * @param publicRelativePath  Path relative to the `public/` directory,
 *   e.g. `"brand/logo-color.png"` or `"brand/og-tiles/teal-chip.png"`.
 */
export function loadImageAsDataUri(publicRelativePath: string): Promise<string | null> {
  const cached = _imageCache.get(publicRelativePath);
  if (cached) return cached;
  const promise = readFile(join(process.cwd(), 'public', publicRelativePath))
    .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
    .catch(() => null);
  _imageCache.set(publicRelativePath, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Tile grid
// ---------------------------------------------------------------------------

/**
 * Tile grid layout (row-major, 2 columns). Each element is either a tile spec
 * with a filename and optional rotation (in degrees) or null for empty cells.
 *
 * This grid is used by both the compare and blog OG image renderers to create
 * a consistent family appearance. Tile files are located in `public/brand/og-tiles/`.
 */
export const TILE_GRID: ({ file: string; rotate?: number } | null)[] = [
  { file: 'teal-chevron.png', rotate: 180 },
  { file: 'gold-diagonal.png' },
  { file: 'teal-circuit.png' },
  null,
  { file: 'gold-wavy.png' },
  { file: 'teal-chip.png' },
  { file: 'teal-chevron.png', rotate: 90 },
  { file: 'teal-organic.png' },
  null,
  { file: 'gold-circuit.png' },
  { file: 'teal-circuit.png', rotate: 180 },
  { file: 'teal-organic.png', rotate: 180 },
];

// ---------------------------------------------------------------------------
// Axis-nicing helpers  (extracted verbatim from performance-per-dollar.png/route.tsx)
// ---------------------------------------------------------------------------

/**
 * Format a monetary value with automatic decimal precision based on its
 * magnitude — `$10.0`, `$1.23`, `$0.456`.
 */
export function money(value: number): string {
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}

/**
 * Decimals chosen from the tick step so every label in the axis prints with
 * the same precision (no $0.000/$9.01/$18.0 mix).
 */
export function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.max(0, Math.ceil(-Math.log10(step)));
}

/** Format a monetary axis tick using the shared step-derived precision. */
export function moneyForStep(value: number, step: number): string {
  return `$${value.toFixed(decimalsForStep(step))}`;
}

/**
 * "Nice" step in the 1/2/5 × 10ⁿ family — the same convention d3 uses.
 */
export function niceStep(span: number, targetCount: number): number {
  const rawStep = span / Math.max(1, targetCount - 1);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / mag;
  if (normalized < 1.5) return mag;
  if (normalized < 3) return 2 * mag;
  if (normalized < 7) return 5 * mag;
  return 10 * mag;
}

/**
 * Compute a nicely-rounded axis: snaps min/max to a 1/2/5×10ⁿ grid and
 * returns the full set of tick values.
 */
export function niceAxis(
  min: number,
  max: number,
  targetCount = 5,
): { min: number; max: number; step: number; ticks: number[] } {
  if (max <= min) return { min, max: min + 1, step: 1, ticks: [min] };
  const step = niceStep(max - min, targetCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step * 1e-6; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

// ---------------------------------------------------------------------------
// Text-layout helpers  (extracted verbatim from blog/[slug]/og-image-render.tsx)
// ---------------------------------------------------------------------------

/**
 * Choose a title font-size (px) that keeps short titles large and long titles
 * from overflowing.  Mirrors the ternary in og-image-render.tsx exactly.
 */
export function ogTitleFontSize(titleLength: number): number {
  if (titleLength > 50) return 56;
  if (titleLength > 35) return 64;
  return 72;
}

/**
 * Truncate subtitle text to the space available below the title inside an OG
 * image content box.
 *
 * All constants are the same values hard-coded in og-image-render.tsx so the
 * output is byte-identical.
 *
 * @param subtitle      Raw subtitle string.
 * @param titleLength   Character count of the title (used to derive font-size
 *                      and therefore title height).
 * @param contentWidth  Width of the text box in CSS pixels (default 895).
 * @param textBoxHeight Height of the text box in CSS pixels (default 482).
 */
export function ogWrapSubtitle(
  subtitle: string,
  titleLength: number,
  contentWidth = 895,
  textBoxHeight = 482,
): string {
  const titleSize = ogTitleFontSize(titleLength);
  const titleLineH = Math.ceil(titleSize * 1.2);
  const charsPerTitleLine = Math.floor(contentWidth / (titleSize * 0.55));
  const titleLines = Math.ceil(titleLength / charsPerTitleLine);
  const titleHeight = titleLines * titleLineH + 18; // +18 for gap
  const subtitleLineH = Math.ceil(42 * 1.4);
  const subtitleSpace = textBoxHeight - titleHeight;
  const maxSubtitleLines = Math.max(0, Math.floor(subtitleSpace / subtitleLineH));
  const charsPerSubtitleLine = Math.floor(contentWidth / (42 * 0.52));
  const maxSubtitleChars = maxSubtitleLines * charsPerSubtitleLine;

  if (maxSubtitleChars <= 0) return '';
  if (subtitle.length > maxSubtitleChars) {
    return `${subtitle.slice(0, maxSubtitleChars).replace(/\s\S*$/u, '')}…`;
  }
  return subtitle;
}
