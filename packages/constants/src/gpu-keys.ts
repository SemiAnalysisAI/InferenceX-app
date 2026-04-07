/** Single source of truth for GPU metadata. Add new GPUs here. */
export const HW_REGISTRY = {
  h100: { vendor: 'NVIDIA', arch: 'Hopper', label: 'H100' },
  h200: { vendor: 'NVIDIA', arch: 'Hopper', label: 'H200' },
  b200: { vendor: 'NVIDIA', arch: 'Blackwell', label: 'B200' },
  b300: { vendor: 'NVIDIA', arch: 'Blackwell', label: 'B300' },
  gb200: { vendor: 'NVIDIA', arch: 'Blackwell', label: 'GB200 NVL72' },
  gb300: { vendor: 'NVIDIA', arch: 'Blackwell', label: 'GB300 NVL72' },
  mi300x: { vendor: 'AMD', arch: 'CDNA 3', label: 'MI300X' },
  mi325x: { vendor: 'AMD', arch: 'CDNA 3', label: 'MI325X' },
  mi355x: { vendor: 'AMD', arch: 'CDNA 4', label: 'MI355X' },
} as const;

/** Canonical set of GPU key strings used across all packages. */
export const GPU_KEYS = new Set(Object.keys(HW_REGISTRY));

/** Maps each GPU key to its vendor for display grouping. */
export const GPU_VENDORS: Record<string, string> = Object.fromEntries(
  Object.entries(HW_REGISTRY).map(([k, v]) => [k, v.vendor]),
);

// ---------------------------------------------------------------------------
// Vendor color zones
//
// To add a new vendor: add an entry to HW_REGISTRY above, then add color
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
 * Preferred HSL hue zones for high-contrast mode.
 * Each vendor gets a non-overlapping slice of the 360° hue wheel so items
 * from different vendors are visually distinct and vendor-appropriate
 * (NVIDIA = greens, AMD = reds/oranges, unknown = blues/purples).
 * When a vendor has too many items to fit with sufficient spacing, the zone
 * expands symmetrically — these are preferred zones, not hard constraints.
 *
 * Layout (360° wheel):
 *   NVIDIA:  60–195  (135°) — greens through cyans
 *   AMD:     300–360 + 0–60  (120°, wraps) — magentas through oranges
 *   unknown: 195–300 (105°) — blues/purples
 *
 * Each entry is an array of linear {start, span} segments (wrapping bands
 * are split into two segments).
 */
export const VENDOR_HSL_ZONES: Record<string, { start: number; span: number }[]> = {
  nvidia: [{ start: 60, span: 135 }],
  amd: [
    { start: 300, span: 60 },
    { start: 0, span: 60 },
  ],
  unknown: [{ start: 195, span: 105 }],
};
