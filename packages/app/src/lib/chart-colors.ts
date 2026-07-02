/**
 * High-contrast color generation (iwanthue — k-means in CIELab).
 *
 * Runtime-compatible: no Node.js-specific modules (fs, path) or build-time
 * dependencies. Split out of chart-utils.ts; re-exported from there so existing
 * imports (`@/lib/chart-utils`) keep working unchanged.
 */

import iwanthue from 'iwanthue';

import { getVendor, type Vendor } from '@/lib/dynamic-colors';

// ---------------------------------------------------------------------------
// High-contrast color generation (iwanthue — k-means in CIELab)
// ---------------------------------------------------------------------------

/**
 * Banned hue test per vendor (CIELab hue angle, 0-360).
 * In Lab space: 0° = red, 90° = yellow, 180° = green, 270° = blue.
 * NVIDIA must not be red/rose/pink (wraps around 0°: 320–40°).
 * AMD must not be green (roughly 120–195°).
 */
const BANNED_HUE_TEST: Record<Vendor, ((hue: number) => boolean) | null> = {
  nvidia: (hue) => hue >= 320 || hue <= 40, // red/rose/pink zone
  amd: (hue) => hue >= 120 && hue <= 195, // green zone
  unknown: null,
};

/**
 * Preferred hue ranges (CIELab) — used when a vendor has few items so they
 * cluster in the brand-appropriate zone. NVIDIA = greens, AMD = reds/oranges.
 */
const PREFERRED_ZONE: Record<
  Vendor,
  { hmin: number; hmax: number; cmin?: number; lmin?: number } | null
> = {
  nvidia: { hmin: 100, hmax: 195 }, // greens/teals
  amd: { hmin: 20, hmax: 50, cmin: 70, lmin: 50 }, // vivid reds/oranges
  unknown: null,
};

/** Max items that fit distinctly in the preferred zone before we open up. */
const PREFERRED_MAX = 4;

/** Beyond this count per vendor, drop the hue ban entirely for best spacing. */
const BAN_MAX = 10;

/**
 * Palette cache. iwanthue's force-vector clustering costs tens of
 * milliseconds per call (quality 50 × 5 attempts) and shows up as main-thread
 * time on every render that recomputes high-contrast colors. The output is
 * fully deterministic (seeded RNG) and — crucially — independent of the key
 * *names*: a vendor group's palette depends only on the item count, vendor
 * zone/ban mode, theme seed, and lightness bounds. Identical requests across
 * renders, charts, and tabs therefore share one entry. Key space is tiny
 * (vendors × themes × counts × 3 modes), so no eviction is needed.
 */
const PALETTE_CACHE = new Map<string, string[]>();

/**
 * Generates high-contrast colors using iwanthue (k-means in CIELab space).
 *
 * Tiered strategy per vendor:
 *   ≤ PREFERRED_MAX → constrain to brand zone (NVIDIA=green, AMD=red)
 *   ≤ BAN_MAX       → full wheel minus rival's brand color
 *   > BAN_MAX       → full wheel, no restrictions, best spacing wins
 */
export const generateHighContrastColors = (
  keys: string[],
  theme: string,
  vendorKeyFor?: (key: string) => string,
): Record<string, string> => {
  if (keys.length === 0) return {};

  const colors: Record<string, string> = {};
  const [lmin, lmax] = theme === 'dark' || theme === 'minecraft' ? [50, 100] : [30, 65];

  // Group keys by vendor. When vendorKeyFor is provided, vendor is derived
  // from the mapped key (e.g. a hwKey) so callers can output colors keyed by
  // a display identifier (e.g. configLabel) while still getting vendor-aware
  // preferred-zone and banned-hue logic.
  const groups = new Map<Vendor, string[]>();
  for (const key of keys) {
    const vendor = getVendor(vendorKeyFor ? vendorKeyFor(key) : key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  for (const [vendor, vendorKeys] of groups) {
    const count = vendorKeys.length;
    const isBanned = BANNED_HUE_TEST[vendor] ?? null;
    const preferred = PREFERRED_ZONE[vendor] ?? null;

    // Tier 1: few items → brand zone only
    // Tier 2: moderate  → full wheel minus rival color
    // Tier 3: many      → full wheel, no restrictions
    const usePreferred = preferred && count <= PREFERRED_MAX;
    const useBan = !usePreferred && isBanned && count <= BAN_MAX;

    // Everything iwanthue's output depends on (the ban filter and preferred
    // zone are functions of vendor; the seed is vendor+theme).
    const mode = usePreferred ? 'pref' : useBan ? 'ban' : 'open';
    const cacheKey = `${vendor}|${theme}|${count}|${mode}|${lmin}|${lmax}`;

    let palette = PALETTE_CACHE.get(cacheKey);
    if (!palette) {
      palette = iwanthue(count, {
        colorSpace: usePreferred
          ? {
              hmin: preferred.hmin,
              hmax: preferred.hmax,
              cmin: preferred.cmin ?? 30,
              cmax: 100,
              lmin: Math.max(lmin, preferred.lmin ?? 0),
              lmax,
            }
          : { hmin: 0, hmax: 360, cmin: 30, cmax: 100, lmin, lmax },
        ...(useBan &&
          isBanned && {
            colorFilter: (_rgb: [number, number, number], lab: [number, number, number]) => {
              // Enforce lightness bounds — force-vector can drift outside colorSpace
              if (lab[0] < lmin || lab[0] > lmax) return false;
              const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
              return !isBanned(hue);
            },
          }),
        seed: `${vendor}-${theme}`,
        clustering: 'force-vector',
        quality: 50,
        attempts: 5,
      });
      PALETTE_CACHE.set(cacheKey, palette);
    }

    vendorKeys.sort();
    vendorKeys.forEach((key, i) => {
      colors[key] = palette[i];
    });
  }
  return colors;
};
