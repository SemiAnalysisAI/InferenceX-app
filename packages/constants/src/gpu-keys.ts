export interface HwEntry {
  /** GPU vendor (e.g. "NVIDIA", "AMD") */
  vendor: string;
  /** Architecture codename (e.g. "Hopper", "Blackwell", "CDNA 4") */
  arch: string;
  /** Display label (e.g. "H100", "GB200 NVL72") */
  label: string;
  /** Optional compact label for power/TCO badges. Defaults to the uppercase key. */
  badgeLabel?: string;
  /** Chart sort order (lower = first) */
  sort: number;
  /** Thermal design power in watts; 0 means not yet available. */
  tdp: number;
  /** All-in kW per GPU (chip + per-GPU share of host/NICs) — SemiAnalysis AI Cloud
   * TCO Model, "Chip Specifications" sheet, Power → "All-In (W)" column */
  power: number;
  /** $/GPU/hr — owning at large hyperscaler volume */
  costh: number;
  /** $/GPU/hr — retail tier */
  costr: number;
}

/** Single source of truth for GPU metadata. Add new GPUs here. */
export const HW_REGISTRY: Record<string, HwEntry> = {
  vr200: {
    vendor: 'NVIDIA',
    arch: 'Vera Rubin',
    label: 'Vera Rubin',
    sort: -1,
    tdp: 1800,
    power: 3.3,
    costh: 3.61,
    costr: 8.5,
  },
  h100: {
    vendor: 'NVIDIA',
    arch: 'Hopper',
    label: 'H100',
    sort: 7,
    tdp: 700,
    power: 1.37,
    costh: 1.17,
    costr: 2,
  },
  h200: {
    vendor: 'NVIDIA',
    arch: 'Hopper',
    label: 'H200',
    sort: 5,
    tdp: 700,
    power: 1.37,
    costh: 1.22,
    costr: 2.9,
  },
  b200: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'B200',
    sort: 3,
    tdp: 1000,
    power: 1.71,
    costh: 1.73,
    costr: 3.7,
  },
  b300: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'B300',
    sort: 2,
    tdp: 1200,
    power: 1.9,
    costh: 2.26,
    costr: 4.25,
  },
  gb200: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'GB200 NVL72',
    sort: 1,
    tdp: 1200,
    power: 1.87,
    costh: 1.86,
    costr: 4,
  },
  gb300: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'GB300 NVL72',
    sort: 0,
    tdp: 1400,
    power: 2.12,
    costh: 2.31,
    costr: 5,
  },
  mi300x: {
    vendor: 'AMD',
    arch: 'CDNA 3',
    label: 'MI300X',
    sort: 8,
    tdp: 750,
    power: 1.39,
    costh: 0.95,
    costr: 1.3,
  },
  mi325x: {
    vendor: 'AMD',
    arch: 'CDNA 3',
    label: 'MI325X',
    sort: 6,
    tdp: 1000,
    power: 1.69,
    costh: 1.1,
    costr: 1.6,
  },
  mi355x: {
    vendor: 'AMD',
    arch: 'CDNA 4',
    label: 'MI355X',
    sort: 4,
    tdp: 1400,
    power: 2.09,
    costh: 1.5,
    costr: 2.9,
  },
  // NVIDIA RTX PRO 6000 Blackwell Server Edition (GB202, PCIe Gen5, 96 GB GDDR7).
  // A workstation-class PCIe card benchmarked in 8× TP configs (no NVLink/NVSwitch);
  // sorts last, after the datacenter SXM/OAM parts. TDP is the datasheet 600 W max
  // board power; power and cost tiers are from the SemiAnalysis AI Cloud TCO model.
  rtx6000pro: {
    vendor: 'NVIDIA',
    arch: 'Blackwell',
    label: 'RTX PRO 6000',
    sort: 9,
    tdp: 600,
    power: 0.975,
    costh: 0.68,
    costr: 0.52,
  },
  jalapeno: {
    vendor: 'OpenAI',
    arch: 'Jalapeño',
    label: 'Jalapeño',
    badgeLabel: 'Jalapeño (OpenAI)',
    sort: 10,
    tdp: 700,
    power: 1.125,
    costh: 1.27,
    costr: 1.27,
  },
  tpuv7: {
    vendor: 'Google',
    arch: 'Ironwood',
    label: 'TPU7x',
    sort: 11,
    tdp: 980,
    power: 1.207,
    costh: 1.21,
    /** GCP 3-year commit rental rate per chip-hour (SemiAnalysis AI Cloud TCO Model). */
    costr: 2,
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

/** Google brand blue, used unchanged for a single Google hardware series. */
export const GOOGLE_BLUE = '#4285F4';

/**
 * OKLch hue zones for normal-mode vendor-aware colors.
 * Narrow, precise bands for assigning brand-matching color shades.
 *
 * Layout (approximate):
 *   0-12    (gap)
 *   12-42   AMD reds/oranges
 *   42-120  (gap)
 *   120-170 NVIDIA greens
 *   170-185 (gap)
 *   185-235 unknown / fallback (cyans/teals)
 *   235-250 (gap)
 *   250-275 Google blues (brand hue ~260)
 *   275-290 (gap)
 *   290-330 OpenAI purples
 *   330-360 (gap)
 */
export const VENDOR_OKLCH_ZONES: Record<
  string,
  { start: number; end: number; chroma: { light: number; dark: number } }
> = {
  amd: { start: 12, end: 42, chroma: { light: 0.18, dark: 0.22 } },
  nvidia: { start: 120, end: 170, chroma: { light: 0.15, dark: 0.15 } },
  openai: { start: 290, end: 330, chroma: { light: 0.16, dark: 0.18 } },
  google: { start: 250, end: 275, chroma: { light: 0.16, dark: 0.18 } },
  unknown: { start: 185, end: 235, chroma: { light: 0.12, dark: 0.14 } },
};

/**
 * Preferred HSL hue zones for high-contrast mode.
 * Each vendor gets a non-overlapping slice of the 360° hue wheel so items
 * from different vendors are visually distinct and vendor-appropriate
 * (NVIDIA = greens, AMD = reds/oranges, Google = blues, OpenAI = purples).
 * When a vendor has too many items to fit with sufficient spacing, the zone
 * expands symmetrically — these are preferred zones, not hard constraints.
 *
 * Layout (360° wheel):
 *   NVIDIA:  40–180  (140°) — yellow-greens through cyans
 *   unknown: 180–205 (25°) — cyans
 *   Google:  205–235 (30°) — blues (brand hue ~217)
 *   OpenAI:  255–300 (45°) — purples/violets
 *   AMD:     300–360 + 0–40  (100°, wraps) — magentas through oranges
 *
 * Each entry is an array of linear {start, span} segments (wrapping bands
 * are split into two segments).
 */
export const VENDOR_HSL_ZONES: Record<string, { start: number; span: number }[]> = {
  nvidia: [{ start: 40, span: 140 }],
  openai: [{ start: 255, span: 45 }],
  amd: [
    { start: 300, span: 60 },
    { start: 0, span: 40 },
  ],
  google: [{ start: 205, span: 30 }],
  unknown: [{ start: 180, span: 25 }],
};
