/**
 * Dynamic vendor-aware color assignment for charts.
 *
 * Instead of pre-assigning a fixed color to every hardware config,
 * this module divides OKLch hue space into vendor zones and distributes
 * hues evenly among only the *active* (checked) items. Fewer active items
 * → more perceptual distance between colors → easier to distinguish.
 */

import { GPU_VENDORS, VENDOR_OKLCH_ZONES } from '@semianalysisai/inferencex-constants';
import { getModelSortIndex } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Vendor detection
// ---------------------------------------------------------------------------

export type Vendor = 'nvidia' | 'amd' | 'unknown';

/** Determine vendor from a hardware key by looking up GPU_VENDORS. */
export function getVendor(hwKey: string): Vendor {
  // hwKey may have a framework suffix (e.g. "h100_vllm") — strip it to get the GPU base key
  const base = hwKey.split('_')[0];
  // Keys whose dataset carries an explicit vendor (e.g. CollectiveX series) lead
  // with the vendor name itself rather than a registered GPU key.
  if (base === 'nvidia' || base === 'amd') return base;
  const vendor = GPU_VENDORS[base];
  if (vendor === 'NVIDIA') return 'nvidia';
  if (vendor === 'AMD') return 'amd';
  return 'unknown';
}

// Vendor color zones are defined in @semianalysisai/inferencex-constants (gpu-keys.ts).
// VENDOR_OKLCH_ZONES — OKLch hue zones for normal-mode vendor colors.
// High-contrast mode uses iwanthue (CIELab k-means) — see chart-utils.ts.

// ---------------------------------------------------------------------------
// Lightness ranges
// ---------------------------------------------------------------------------

/** Lightness range for the standard (non-date-comparison) palette. */
const LIGHTNESS = {
  light: { min: 0.42, max: 0.68 },
  dark: { min: 0.5, max: 0.78 },
} as const;

/** When there are many items we can use the full lightness range for extra separation. */
function pickLightness(index: number, count: number, theme: 'light' | 'dark'): number {
  const { min, max } = LIGHTNESS[theme];
  if (count <= 1) return (min + max) / 2;
  // Spread evenly — brightest first so the "top" legend entry pops.
  return max - (index / (count - 1)) * (max - min);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an OKLch color for each active hardware key.
 *
 * Keys are grouped by vendor, sorted for stability, then each group's
 * hues are evenly spaced across the vendor's zone.  When a single vendor
 * has many items, lightness is also varied for extra differentiation.
 *
 * @param activeKeys - The hardware keys that are currently checked / visible.
 * @param theme      - 'light' or 'dark'.
 * @returns Map of hwKey → `oklch(L C H)` string.
 */
export function generateVendorColors(
  activeKeys: string[],
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};

  // Group by vendor
  const groups = new Map<Vendor, string[]>();
  for (const key of activeKeys) {
    const vendor = getVendor(key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  // For each vendor, sort then distribute hues
  for (const [vendor, keys] of groups) {
    // Stable sort: model sort index first, then alphabetical
    keys.sort((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b));

    const zone = VENDOR_OKLCH_ZONES[vendor];
    const chroma = zone.chroma[theme];
    const count = keys.length;

    for (let i = 0; i < count; i++) {
      // Evenly space hues, with padding at the edges so the first and last
      // don't land right on the boundary.
      const hue =
        count <= 1
          ? (zone.start + zone.end) / 2
          : zone.start + ((i + 0.5) / count) * (zone.end - zone.start);

      const lightness = pickLightness(i, count, theme);
      result[keys[i]] = `oklch(${lightness.toFixed(3)} ${chroma} ${hue.toFixed(1)})`;
    }
  }

  return result;
}

/**
 * Generate colors for the GPU-date comparison graph.
 *
 * Each GPU gets a distinct hue (within its vendor zone). Each date for that
 * GPU gets a different lightness — lighter = older, darker = newer.
 *
 * @param gpuKeys   - The GPU hardware keys being compared.
 * @param dateCount - Number of dates being compared.
 * @param theme     - 'light' or 'dark'.
 * @returns Map of `${date-index}_${hwKey}` → color string.
 */
export function generateGpuDateColors(
  gpuKeys: string[],
  dateCount: number,
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};

  // Group GPUs by vendor for hue assignment
  const groups = new Map<Vendor, string[]>();
  for (const key of gpuKeys) {
    const vendor = getVendor(key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  const { min: lMin, max: lMax } = LIGHTNESS[theme];

  for (const [vendor, keys] of groups) {
    keys.sort((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b));

    const zone = VENDOR_OKLCH_ZONES[vendor];
    const chroma = zone.chroma[theme];
    const gpuCount = keys.length;

    for (let gi = 0; gi < gpuCount; gi++) {
      const hue =
        gpuCount <= 1
          ? (zone.start + zone.end) / 2
          : zone.start + ((gi + 0.5) / gpuCount) * (zone.end - zone.start);

      for (let di = 0; di < dateCount; di++) {
        // Oldest date = lightest, newest = darkest
        const lightness =
          dateCount <= 1 ? (lMin + lMax) / 2 : lMax - (di / (dateCount - 1)) * (lMax - lMin);
        const compositeKey = `${di}_${keys[gi]}`;
        result[compositeKey] = `oklch(${lightness.toFixed(3)} ${chroma} ${hue.toFixed(1)})`;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// High-contrast GPU × date gradient
// ---------------------------------------------------------------------------

/**
 * Total OKLch lightness span swept across the compared dates in high-contrast
 * mode. Wide on purpose: the whole point of the gradient is that consecutive
 * dates read apart at a glance, so a subtle ramp would defeat it.
 */
const HC_DATE_L_SPAN = 0.36;

/**
 * Absolute lightness bounds for the ramp so neither end of the gradient washes
 * out against the page background (dark themes need a higher floor).
 */
const HC_DATE_L_BOUNDS = {
  light: { min: 0.34, max: 0.86 },
  dark: { min: 0.44, max: 0.95 },
} as const;

/** sRGB channel (0–1) → linear-light. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parse `#rgb` / `#rrggbb` into OKLch `[L, C, H]`, or null when unparseable. */
function hexToOklch(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join('') : raw;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/iu.test(full)) return null;

  const r = srgbToLinear(Number.parseInt(full.slice(0, 2), 16) / 255);
  const g = srgbToLinear(Number.parseInt(full.slice(2, 4), 16) / 255);
  const b = srgbToLinear(Number.parseInt(full.slice(4, 6), 16) / 255);

  // Linear sRGB → OKLab (Björn Ottosson's matrices).
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(okA, okB);
  const hue = ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;
  return [okL, chroma, hue];
}

/**
 * Spread one high-contrast base color per GPU across the compared dates.
 *
 * High contrast previously handed every `date × GPU` series its own iwanthue
 * hue, which severed the visual link between a hardware config's own runs. Here
 * the hue/chroma stay pinned to the GPU (so a config keeps one identity) and
 * only lightness ramps — oldest lightest → newest darkest, matching the
 * non-high-contrast ramp in {@link generateGpuDateColors}.
 *
 * @param baseColors - hwKey → high-contrast base color (hex from iwanthue).
 * @param dateCount  - Number of dates being compared.
 * @param theme      - 'light' or 'dark'.
 * @returns Map of `${date-index}_${hwKey}` → `oklch(L C H)` string. GPUs whose
 *          base color can't be parsed keep that base color at every date index.
 */
export function generateHighContrastGpuDateColors(
  baseColors: Record<string, string>,
  dateCount: number,
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};
  if (dateCount <= 0) return result;

  const { min: lMin, max: lMax } = HC_DATE_L_BOUNDS[theme];

  for (const [hwKey, base] of Object.entries(baseColors)) {
    const oklch = hexToOklch(base);
    if (!oklch) {
      for (let di = 0; di < dateCount; di++) result[`${di}_${hwKey}`] = base;
      continue;
    }
    const [baseL, chroma, hue] = oklch;

    // Center the ramp on the base lightness, then slide (not squash) it back
    // inside the theme bounds so the full span survives near the extremes.
    const span = Math.min(HC_DATE_L_SPAN, lMax - lMin);
    let top = Math.min(lMax, baseL + span / 2);
    let bottom = top - span;
    if (bottom < lMin) {
      bottom = lMin;
      top = bottom + span;
    }

    for (let di = 0; di < dateCount; di++) {
      const lightness = dateCount <= 1 ? baseL : top - (di / (dateCount - 1)) * span;
      result[`${di}_${hwKey}`] =
        `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
    }
  }

  return result;
}
