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
 * The SVGs are inlined as `data:` URIs (rather than referencing
 * `public/logos/*`) so the marks render synchronously inside the D3 SVG —
 * no network fetch, no flicker on zoom re-renders — and survive the
 * html-to-image chart export path without any resource embedding.
 *
 * Color notes (this is deliberate — do not swap in the monochrome
 * `public/logos/{nvidia,amd}.svg` simple-icons assets here):
 * - NVIDIA: official brand green `#76B900` eye mark, backed by a black
 *   outline (`paint-order: stroke` draws the stroke behind the fill, so the
 *   green mark stays full-width and the outline extends outward). NVIDIA
 *   series lines are green, so without the outline the mark disappears into
 *   the pill fill on those labels.
 * - AMD: the arrow symbol from the official AMD logo, in brand black —
 *   symbol only, no "AMD" wordmark, so it reads as a square mark like the
 *   other vendor icons at the 10px label size.
 * - OpenAI (Jalapeño): the OpenAI mark is monochrome by design; the white
 *   reversed variant is the official usage on colored backgrounds.
 * The marks are drawn with a transparent background directly on the pill,
 * so the area behind each logo stays the exact shade of the line-label fill.
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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#76B900" stroke="#000000" stroke-width="2" stroke-linejoin="round" paint-order="stroke"><path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"/></svg>';

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
  NVIDIA: { href: svgDataUri(NVIDIA_LOGO_SVG), width: 10, height: 10 },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 10, height: 10 },
  // Jalapeño (Teacup) is OpenAI silicon — it carries the OpenAI mark.
  Teacup: { href: svgDataUri(OPENAI_LOGO_SVG), width: 10, height: 10 },
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
