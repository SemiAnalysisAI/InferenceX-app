import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

export const HW_VENDOR_LOGOS: Record<string, string> = {
  NVIDIA: 'nvidia-color.svg',
  AMD: 'amd.svg',
  Google: 'google.svg',
};

export function getHwVendorLogo(vendor: string | undefined): string | undefined {
  return vendor ? HW_VENDOR_LOGOS[vendor] : undefined;
}

export interface VendorLogoIcon {
  href: string;
  width: number;
  height: number;
}

const svgDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// Official eye mark (Wikimedia Commons NVIDIA_logo.svg), cropped to its own bounds.
const NVIDIA_EYE_PATH =
  'M16.889,8.985L16.889,6.28C17.151,6.26 17.417,6.247 17.687,6.238C25.087,6.006 29.942,12.597 29.942,12.597C29.942,12.597 24.698,19.879 19.076,19.879C18.333,19.882 17.594,19.764 16.889,19.529L16.889,11.325C19.769,11.673 20.349,12.945 22.081,15.833L25.933,12.585C25.933,12.585 23.121,8.897 18.381,8.897C17.866,8.897 17.373,8.933 16.889,8.985ZM16.889,0.047L16.889,4.09C17.154,4.069 17.42,4.052 17.687,4.042C27.977,3.696 34.682,12.482 34.682,12.482C34.682,12.482 26.982,21.846 18.959,21.846C18.224,21.846 17.535,21.778 16.889,21.663L16.889,24.161C17.442,24.231 18.015,24.273 18.613,24.273C26.078,24.273 31.477,20.461 36.705,15.948C37.572,16.642 41.121,18.331 41.85,19.071C36.879,23.231 25.295,26.586 18.727,26.586C18.113,26.584 17.5,26.552 16.889,26.49L16.889,30L45.264,30L45.264,0.047L16.889,0.047ZM16.889,19.529L16.889,21.662C9.984,20.432 8.067,13.254 8.067,13.254C8.067,13.254 11.383,9.58 16.889,8.985L16.889,11.325L16.878,11.324C13.988,10.977 11.731,13.677 11.731,13.677C11.731,13.677 12.996,18.221 16.889,19.529ZM4.625,12.943C4.625,12.943 8.717,6.903 16.889,6.28L16.889,4.088C7.838,4.815 0,12.48 0,12.48C0,12.48 4.439,25.313 16.889,26.488L16.889,24.16C7.753,23.011 4.625,12.943 4.625,12.943Z';

const nvidiaEyeSvg = (fill: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0.047 45.264 29.953" fill="${fill}"><path d="${NVIDIA_EYE_PATH}"/></svg>`;

const AMD_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="18.277 9.137 5.723 5.726" fill="#000000"><path d="M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137z"/><path d="M19.881 11.01L18.277 12.613L18.277 14.863L20.523 14.863L22.127 13.256L19.881 13.256z"/></svg>';

const OPENAI_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 260" fill="#000000"><path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/></svg>';

const GOOGLE_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" fill="#000000"/><path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" fill="#000000"/><path d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" fill="#000000"/><path d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" fill="#000000"/></svg>';

/** Black marks for neutral backgrounds such as the vendor picker. */
export const VENDOR_MARK_HREFS: Record<string, string> = {
  Google: svgDataUri(GOOGLE_LOGO_SVG),
  NVIDIA: svgDataUri(nvidiaEyeSvg('#000000')),
  AMD: svgDataUri(AMD_LOGO_SVG),
  OpenAI: svgDataUri(OPENAI_LOGO_SVG),
};

// Line-label pills draw white text; the marks share that fill so mark and name read as one.
const LINE_LABEL_MARK_FILL = '#ffffff';
const onLabel = (svg: string): string =>
  svgDataUri(svg.replaceAll('#000000', LINE_LABEL_MARK_FILL));

// Equal ink area so no mark looks bigger: each matches the solid AMD square at 12px, a bit above cap height.
export const VENDOR_LOGO_ICONS: Record<string, VendorLogoIcon> = {
  Google: { href: onLabel(GOOGLE_LOGO_SVG), width: 13.2, height: 13.2 },
  NVIDIA: { href: onLabel(nvidiaEyeSvg('#000000')), width: 15, height: 9.9 },
  AMD: { href: onLabel(AMD_LOGO_SVG), width: 12, height: 12 },
  OpenAI: { href: onLabel(OPENAI_LOGO_SVG), width: 15, height: 15 },
};

export interface AxisVendorLogoIcon extends VendorLogoIcon {
  monochrome: boolean;
}

const NVIDIA_COLOR_LOGO_SVG = nvidiaEyeSvg('#76B900');

export const AXIS_VENDOR_LOGO_ICONS: Record<string, AxisVendorLogoIcon> = {
  Google: { href: svgDataUri(GOOGLE_LOGO_SVG), width: 10, height: 10, monochrome: true },
  NVIDIA: { href: svgDataUri(NVIDIA_COLOR_LOGO_SVG), width: 21, height: 14, monochrome: false },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 10, height: 10, monochrome: true },
};

export function getAxisVendorIcon(hwKey: string): AxisVendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? AXIS_VENDOR_LOGO_ICONS[vendor] : undefined;
}

export function getLineLabelVendorIcon(hwKey: string): VendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? VENDOR_LOGO_ICONS[vendor] : undefined;
}
