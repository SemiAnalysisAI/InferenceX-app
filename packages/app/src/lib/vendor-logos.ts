/**
 * Maps `HW_REGISTRY` vendor names to logo files under `public/logos/`.
 *
 * NVIDIA uses its official full-color mark (NVIDIA green, #76B900), which is
 * legible on both themes as-is. AMD's corporate mark is monochrome by design —
 * the brand guidelines only permit the standard black logo or the reversed-out
 * white logo (the legacy green-arrow mark is retired), so it relies on the
 * shared dark-mode invert from `isMonochromeLogo` instead of a color variant.
 *
 * Vendors without an entry (e.g. Teacup) simply render no logo — surfaces
 * treat the vendor mark as optional decoration beside the hardware label.
 */
export const HW_VENDOR_LOGOS: Record<string, string> = {
  NVIDIA: 'nvidia-color.svg',
  AMD: 'amd.svg',
};

/** Logo filename under `/logos/` for a hardware vendor, if one exists. */
export function getHwVendorLogo(vendor: string | undefined): string | undefined {
  return vendor ? HW_VENDOR_LOGOS[vendor] : undefined;
}
import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

/**
 * Full-color hardware-vendor marks for chart line labels.
 *
 * The SVGs are inlined as `data:` URIs (rather than referencing
 * `public/logos/*`) so the marks render synchronously inside the D3 SVG —
 * no network fetch, no flicker on zoom re-renders — and survive the
 * html-to-image chart export path without any resource embedding.
 *
 * Color notes (this is deliberate — do not swap in the monochrome
 * `public/logos/{nvidia,amd}.svg` simple-icons assets here):
 * - NVIDIA: official brand green `#76B900` eye mark.
 * - AMD: the official full-color (positive) AMD lockup is black-on-white.
 * Line-label pills are filled with the series color, so each mark sits on a
 * small white chip to preserve the official full-color rendering on any
 * pill background in both light and dark mode.
 */
export interface VendorLogoIcon {
  /** `data:image/svg+xml` URI for an SVG `<image href>`. */
  href: string;
  /** Rendered mark width in px (chart/user units). */
  width: number;
  /** Rendered mark height in px (chart/user units). */
  height: number;
}

const svgDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** NVIDIA eye mark (simple-icons geometry) in NVIDIA brand green. */
const NVIDIA_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#76B900"><path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"/></svg>';

/** AMD arrow-and-wordmark lockup (simple-icons geometry) in AMD brand black. */
const AMD_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3.5 7.83 31.0 8.34" fill="#000000"><path d="M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137zM2 9.52l-2 4.96h1.309l.37-.982H3.9l.408.982h1.338L3.432 9.52zm4.209 0v4.955h1.238v-3.092l1.338 1.562h.188l1.338-1.556v3.091h1.238V9.52H10.47l-1.592 1.845L7.287 9.52zm6.283 0v4.96h2.057c1.979 0 2.88-1.046 2.88-2.472 0-1.36-.937-2.488-2.747-2.488zm1.237.91h.792c1.17 0 1.63.711 1.63 1.57 0 .728-.372 1.572-1.616 1.572h-.806zm-10.985.273l.791 1.932H2.008zm17.137.307l-1.604 1.603v2.25h2.246l1.604-1.607h-2.246z"/></svg>';

/**
 * Vendor display name → full-color mark. Vendors without an official public
 * logo (e.g. anonymized preview silicon) are intentionally absent; labels for
 * those series render exactly as before, with no icon.
 */
export const VENDOR_LOGO_ICONS: Record<string, VendorLogoIcon> = {
  NVIDIA: { href: svgDataUri(NVIDIA_LOGO_SVG), width: 10, height: 10 },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 18, height: 4.85 },
};

/**
 * Full-color vendor mark for a hardware key (`gb200`, `mi355x_dsv4`, ...).
 * Uses the same base-key convention as `quickFilters`: everything before the
 * first `_` is the registry key.
 */
export function getLineLabelVendorIcon(hwKey: string): VendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? VENDOR_LOGO_ICONS[vendor] : undefined;
}
