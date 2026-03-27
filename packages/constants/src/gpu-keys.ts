/** Canonical set of GPU key strings used across all packages. */
export const GPU_KEYS = new Set([
  'h100',
  'h200',
  'b200',
  'b300',
  'gb200',
  'gb300',
  'mi300x',
  'mi325x',
  'mi355x',
]);

/** Maps each GPU key to its vendor for display grouping. */
export const GPU_VENDORS: Record<string, string> = {
  h100: 'NVIDIA',
  h200: 'NVIDIA',
  b200: 'NVIDIA',
  b300: 'NVIDIA',
  gb200: 'NVIDIA',
  gb300: 'NVIDIA',
  mi300x: 'AMD',
  mi325x: 'AMD',
  mi355x: 'AMD',
};

// ---------------------------------------------------------------------------
// Vendor color zones
//
// To add a new vendor: add entries to GPU_VENDORS above, then add color
// zones to both maps below (OKLch for normal mode, HSL for high-contrast).
// ---------------------------------------------------------------------------

/**
 * OKLch hue zones for normal-mode vendor-aware colors.
 * Narrow, precise bands for assigning brand-matching color shades.
 *
 * Layout (approximate):
 *   0-12    (gap)
 *   12-42   AMD reds/oranges
 *   42-120  (gap)
 *   120-170 NVIDIA greens
 *   170-275 (gap)
 *   275-330 unknown / fallback (purples)
 *   330-360 (gap)
 */
export const VENDOR_OKLCH_ZONES: Record<
  string,
  { start: number; end: number; chroma: { light: number; dark: number } }
> = {
  amd: { start: 12, end: 42, chroma: { light: 0.18, dark: 0.22 } },
  nvidia: { start: 120, end: 170, chroma: { light: 0.15, dark: 0.15 } },
  unknown: { start: 275, end: 330, chroma: { light: 0.14, dark: 0.16 } },
};

/**
 * HSL hue bands for high-contrast mode.
 * Wide perceptual zones — used to avoid confusing color associations
 * (e.g. NVIDIA keys should not get red hues, AMD keys should not get green).
 * Bands can wrap around 360° (e.g. AMD reds: 310→30 goes through 0°).
 * With 10+ keys per vendor, high-contrast mode ignores these and uses the full wheel.
 */
export const VENDOR_HSL_BANDS: Record<string, { start: number; end: number }> = {
  nvidia: { start: 70, end: 180 }, // greens (yellow-green through cyan)
  amd: { start: 310, end: 30 }, // perceptual reds (pink, rose, red, red-orange)
};
