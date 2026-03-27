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
  const vendor = GPU_VENDORS[base];
  if (vendor === 'NVIDIA') return 'nvidia';
  if (vendor === 'AMD') return 'amd';
  return 'unknown';
}

// Vendor color zones are defined in @semianalysisai/inferencex-constants (gpu-keys.ts).
// VENDOR_OKLCH_ZONES — OKLch hue zones for normal-mode vendor colors.
// VENDOR_HSL_BANDS   — HSL hue bands for high-contrast mode.

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
