import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

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

/**
 * Full-color hardware-vendor marks for chart line labels.
 *
 * The marks are inlined as `data:` URIs (rather than referencing
 * `public/logos/*`) so the marks render synchronously inside the D3 SVG —
 * no network fetch, no flicker on zoom re-renders — and survive the
 * html-to-image chart export path without any resource embedding.
 *
 * Color notes (this is deliberate):
 * - NVIDIA: the eye mark in solid black. NVIDIA series lines (and thus the
 *   label pills) are green, so the brand-green mark is invisible on them;
 *   black is the official monochrome treatment and reads on every pill
 *   color, like the AMD mark. High-resolution transparent PNG sourced from
 *   https://img.icons8.com/ios-filled/256/000000/nvidia.png
 * - AMD: the arrow symbol from the official AMD logo, in brand black —
 *   symbol only, no "AMD" wordmark, so it reads as a square mark like the
 *   other vendor icons at the 10px label size.
 * - OpenAI (Jalapeño): the OpenAI mark is monochrome by design; the white
 *   reversed variant is the official usage on colored backgrounds.
 * The marks are drawn with a transparent background directly on the pill,
 * so the area behind each logo stays the exact shade of the line-label fill.
 */
export interface VendorLogoIcon {
  /** `data:` image URI (SVG or PNG) for an SVG `<image href>`. */
  href: string;
  /** Rendered mark width in px (chart/user units). */
  width: number;
  /** Rendered mark height in px (chart/user units). */
  height: number;
}

const svgDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** NVIDIA eye mark in black (256px transparent PNG, inlined as base64). */
const NVIDIA_LOGO_PNG_URI =
  'data:image/png;base64,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';

/** AMD arrow symbol (extracted from the official logo geometry) in brand black. */
const AMD_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="18.277 9.137 5.723 5.726" fill="#000000"><path d="M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137z"/><path d="M19.881 11.01L18.277 12.613L18.277 14.863L20.523 14.863L22.127 13.256L19.881 13.256z"/></svg>';

/** OpenAI mark (repo `public/logos/openai.svg` geometry) in reversed white. */
const OPENAI_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 260" fill="#ffffff"><path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/></svg>';

/**
 * Vendor display name → mark. Vendors without a known mark are absent;
 * labels for those series render exactly as before, with no icon.
 */
export const VENDOR_LOGO_ICONS: Record<string, VendorLogoIcon> = {
  NVIDIA: { href: NVIDIA_LOGO_PNG_URI, width: 10, height: 10 },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 10, height: 10 },
  // Jalapeño (Teacup) is OpenAI silicon — it carries the OpenAI mark.
  Teacup: { href: svgDataUri(OPENAI_LOGO_SVG), width: 10, height: 10 },
};

/**
 * Full-color vendor marks for axis labels drawn on the page background
 * (not on a coloured pill), where the brand colour is legible.
 *
 * - NVIDIA: the eye mark in NVIDIA green (#76B900), the same glyph as
 *   `public/logos/nvidia-color.svg` cropped to its drawn extent. Green reads on
 *   both themes, so it is never inverted.
 * - AMD: the brand permits only the black mark or its white reverse (the old
 *   green arrow is retired), so the arrow stays black and is inverted to white
 *   in dark mode. `monochrome: true` tells the chart to apply that invert.
 */
export interface AxisVendorLogoIcon extends VendorLogoIcon {
  /** True when the mark is single-colour and should be inverted on dark backgrounds. */
  monochrome: boolean;
}

/** NVIDIA eye mark in brand green; viewBox cropped to the glyph (24 x 14.01 units). */
const NVIDIA_COLOR_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 4.063 24 14.01" fill="#76B900"><path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"/></svg>';

export const AXIS_VENDOR_LOGO_ICONS: Record<string, AxisVendorLogoIcon> = {
  NVIDIA: { href: svgDataUri(NVIDIA_COLOR_LOGO_SVG), width: 24, height: 14, monochrome: false },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 10, height: 10, monochrome: true },
};

/** Full-color vendor mark for a hardware key, for labels on the page background. */
export function getAxisVendorIcon(hwKey: string): AxisVendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? AXIS_VENDOR_LOGO_ICONS[vendor] : undefined;
}

/**
 * Full-color vendor mark for a hardware key (`gb200`, `mi355x_dsv4`, ...).
 * Uses the same base-key convention as `quickFilters`: everything before the
 * first `_` is the registry key.
 */
export function getLineLabelVendorIcon(hwKey: string): VendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? VENDOR_LOGO_ICONS[vendor] : undefined;
}
