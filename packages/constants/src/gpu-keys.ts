export interface HwEntry {
  /** GPU vendor (e.g. "NVIDIA", "AMD") */
  vendor: string;
  /** Architecture codename (e.g. "Hopper", "Blackwell", "CDNA 4") */
  arch: string;
  /** Display label (e.g. "H100", "GB200 NVL72") */
  label: string;
  /** Chart sort order (lower = first) */
  sort: number;
  /** Thermal design power in watts */
  tdp: number;
  /** kW per GPU (for energy calculations) */
  power: number;
  /** $/GPU/hr — hyperscaler tier */
  costh: number;
  /** $/GPU/hr — neocloud tier */
  costn: number;
  /** $/GPU/hr — retail tier */
  costr: number;
}

/** Single source of truth for GPU metadata. Add new GPUs here. */
export const HW_REGISTRY: Record<string, HwEntry> = {
  h100: {
    vendor: 'NVIDIA',
    arch: 'Hopper',
    label: 'H100',
    sort: 7,
    tdp: 700,
    power: 1.73,
    costh: 1.3,
    costn: 1.69,
    costr: 1.3,
  },
  h200: {
    vendor: 'NVIDIA',
    arch: 'Hopper',
    label: 'H200',
    sort: 5,
    tdp: 700,
    power: 1.73,
    costh: 1.41,
    costn: 1.74,
    costr: 1.6,
  },
  b200: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'B200',
    sort: 3,
    tdp: 1000,
    power: 2.17,
    costh: 1.95,
    costn: 2.34,
    costr: 2.9,
  },
  // TODO: B300 pricing is temporary - using 1.2x B200 pricing until official pricing is available
  b300: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'B300',
    sort: 2,
    tdp: 1200,
    power: 2.17,
    costh: 2.34,
    costn: 2.808,
    costr: 3.48,
  },
  gb200: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'GB200 NVL72',
    sort: 1,
    tdp: 1200,
    power: 2.1,
    costh: 2.21,
    costn: 2.75,
    costr: 3.3,
  },
  // TODO: GB300 pricing is temporary - using 1.2x GB200 pricing until official pricing is available
  gb300: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'GB300 NVL72',
    sort: 0,
    tdp: 1400,
    power: 2.1,
    costh: 2.652,
    costn: 3.3,
    costr: 3.96,
  },
  mi300x: {
    vendor: 'AMD',
    arch: 'CDNA 3',
    label: 'MI300X',
    sort: 8,
    tdp: 750,
    power: 1.79,
    costh: 1.12,
    costn: 1.4,
    costr: 1.55,
  },
  mi325x: {
    vendor: 'AMD',
    arch: 'CDNA 3',
    label: 'MI325X',
    sort: 6,
    tdp: 1000,
    power: 2.18,
    costh: 1.28,
    costn: 1.59,
    costr: 1.8,
  },
  mi355x: {
    vendor: 'AMD',
    arch: 'CDNA 4',
    label: 'MI355X',
    sort: 4,
    tdp: 1400,
    power: 2.65,
    costh: 1.48,
    costn: 1.9,
    costr: 2.1,
  },
};

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
