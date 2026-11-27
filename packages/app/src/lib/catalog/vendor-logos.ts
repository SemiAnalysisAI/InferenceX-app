import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

export const HW_VENDOR_LOGOS: Record<string, string> = {
  NVIDIA: 'nvidia-color.svg',
  AMD: 'amd.svg',
  Google: 'google.svg',
  AWS: 'aws.svg',
};

/** Dark-theme files for vendors whose official logo ships a separate dark variant. */
export const HW_VENDOR_DARK_LOGOS: Record<string, string> = {
  AWS: 'aws-dark.svg',
};

export function getHwVendorLogo(vendor: string | undefined): string | undefined {
  return vendor ? HW_VENDOR_LOGOS[vendor] : undefined;
}

export function getHwVendorDarkLogo(vendor: string | undefined): string | undefined {
  return vendor ? HW_VENDOR_DARK_LOGOS[vendor] : undefined;
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

// Official AWS logo (press.aboutamazon.com/logos, AWS_logo_RGB.png) traced to a vector at its own
// bounds. It ships in Squid Ink for light backgrounds and white for dark ones.
const AWS_LOGO_PATH =
  'M57.6 74.9C38.1 73.8 19.8 66.9 4.7 54.8C1.6 52.4 0.2 51.1 0.1 50.6C-0.1 49.7 0.6 49 1.5 49.3C1.7 49.3 2.6 49.8 3.6 50.4C5.6 51.5 10.1 53.8 12.5 54.9C25.5 60.8 40.3 64.5 54.9 65.6C60.9 66 67.7 66 73.4 65.5C86 64.5 99 61.4 110.2 56.7C111.5 56.2 111.8 56.1 112.4 56.1C113.5 56.1 114.3 56.8 114.3 57.8C114.3 58.7 113.9 59.2 111.4 60.9C99.5 68.9 83.4 74 67 74.9C64.9 75 59.8 75 57.6 74.9ZM115.5 69.7C115.4 69.6 115.3 69.3 115.3 69.2C115.3 69 115.7 68 116.1 66.9C119.3 58.6 120.2 54.2 118.9 52.8C118.6 52.5 117.6 52.1 116.7 51.9C116.1 51.8 115.4 51.8 112.9 51.8C109.7 51.7 108.7 51.8 104.8 52.3C103.6 52.4 102.5 52.5 102.4 52.4C101.9 52.2 101.7 51.7 102.1 51.1C102.5 50.5 105.3 48.9 107.4 48.2C112.1 46.6 118.4 46.3 122.7 47.5C123.7 47.7 124.7 48.2 125 48.6C125.3 49 125.4 50.2 125.4 51.5C125.2 56 123.3 61.5 120.7 65.4C119.5 67.2 117.4 69.5 116.6 69.8C116.1 70 115.6 69.9 115.5 69.7ZM102.9 39.1C102.7 39.1 102 39 101.4 38.9C100.7 38.9 99.4 38.6 98.4 38.4C95.8 37.7 94.1 36.9 93.3 36.2C92.8 35.6 92.7 35.3 92.7 33.4C92.7 31.6 92.8 31.3 93.3 31.1C93.7 30.9 94.1 31 95.4 31.6C97.7 32.5 99.3 33 101.7 33.4C103.3 33.6 106.6 33.6 107.9 33.4C110.8 32.8 112.7 31.4 113.1 29.4C113.2 29.1 113.2 28.5 113.2 28C113.1 26 112 24.8 109.3 23.7C108.8 23.5 106.7 22.8 104.8 22.2C101 21 100.1 20.7 99.1 20.2C95.2 18.2 92.9 14.5 93.1 10.4C93.3 7.8 94.3 5.7 96.3 3.8C100.1 0.2 106.3 -0.9 113.2 0.9C115.3 1.5 116.2 1.8 117.1 2.5C117.9 3.1 118 3.5 118.1 5.2C118.1 6.8 118 7.4 117.6 7.7C117.3 7.9 116.6 7.8 115.4 7.3C112.9 6.2 110.3 5.7 107.5 5.7C102.4 5.7 99.8 7.5 100 10.9C100.2 12.7 101.3 14 103.9 15.1C104.4 15.3 106.6 16 108.7 16.7C110.8 17.4 113.1 18.2 113.7 18.4C117.8 20.2 120.1 23.4 120.1 27.6C120.1 29.4 119.8 30.9 119 32.5C117.9 34.6 115.8 36.6 113.5 37.6C112.4 38.1 110.7 38.7 109.4 38.9C108.4 39.1 107.8 39.1 105.7 39.2C104.3 39.2 103 39.2 102.9 39.1ZM14.7 39C12.1 38.7 10 37.7 8.3 36C6.9 34.6 6 33 5.5 30.7C5.3 29.5 5.3 26.8 5.5 25.6C6 23.3 6.8 21.8 8.4 20.1C11.6 17 16.2 15.8 22.5 16.4C23.6 16.5 26.5 17 27.7 17.3L28.5 17.5L28.5 15.5C28.5 14.4 28.5 13.1 28.4 12.5C28.1 9.5 27.1 7.8 25.1 6.8C23.6 6.1 22.4 5.9 19.9 5.9C16.9 5.9 14.6 6.4 11 7.7C9.2 8.4 8.7 8.6 8.4 8.4C7.9 8.2 7.8 7.8 7.8 6C7.8 4.2 7.9 3.8 8.3 3.3C9.2 2.5 13 1.1 15.8 0.6C17.7 0.2 18.9 0.1 21.1 0.1C26.2 0.1 29.8 1.2 32.1 3.7C33.8 5.4 34.6 7.3 35.2 10.7C35.3 11.1 35.4 14.5 35.4 20.5C35.5 28.6 35.5 29.6 35.6 30.2C35.9 31.2 36.2 31.8 36.9 33.3C37.6 34.7 37.6 35.1 37.2 35.6C37 36 34 38 33.4 38.2C32.8 38.4 32.4 38.3 31.6 37.6C30.9 36.8 30.3 36.1 29.5 34.5L28.9 33.4L28 34.3C25.4 37 22.5 38.5 18.9 39C17.7 39.1 15.8 39.1 14.7 39ZM51.3 38.1C50.4 37.9 49.9 37.5 49.6 36.5C49.4 36 40.2 5.6 39.6 3.8C39.2 2.3 39.2 1.8 39.5 1.5C39.9 1.1 40.2 1.1 42.9 1.1C45.2 1.1 45.3 1.2 45.8 1.4C46.2 1.6 46.3 1.7 46.5 2.2C46.7 2.6 48 7.3 50.3 16.6C52.3 24.3 53.9 30.5 53.9 30.4C53.9 30.4 55.4 24.2 57.2 16.7C59 9.1 60.5 2.7 60.6 2.5C60.8 1.9 61.2 1.5 61.7 1.3C62.1 1.1 66 1 66.9 1.2C67.6 1.3 67.7 1.4 68 1.7C68.2 1.9 68.4 2.3 68.5 2.6C68.6 2.8 70.2 9.3 72 17C73.8 24.7 75.3 31 75.3 31C75.3 31 76.9 24.7 78.9 16.9C82.6 2.4 82.8 1.9 83.4 1.5C83.8 1.2 84.8 1.1 87.1 1.1C89.2 1.1 89.3 1.2 89.5 1.4C89.9 1.7 89.9 2.1 89.8 2.9C89.6 3.6 79.3 36.4 79.1 37C79 37.2 78.8 37.5 78.7 37.6C78.2 38.1 77.9 38.1 75.1 38.1C72.7 38.1 72.5 38.1 72.1 37.9C71.5 37.7 71.3 37.3 71 36.5C70.9 36.1 69.4 29.9 67.6 22.7C65.9 15.5 64.4 9.5 64.4 9.5C64.4 9.4 62.9 15.3 61.2 22.6C59.5 29.8 58 36.1 57.9 36.4C57.8 36.8 57.5 37.3 57.4 37.5C56.8 38.1 56.6 38.1 54.1 38.2C52.8 38.2 51.5 38.2 51.3 38.1ZM19.8 33.5C22.6 33.2 24.8 32.1 26.4 30.4C27.9 28.8 28.4 27.3 28.4 24.1L28.5 22.2L27.9 22C25.4 21.5 21.5 21.1 19.5 21.3C15.8 21.6 13.9 22.8 12.9 25.4C12.6 26.3 12.5 28.4 12.7 29.5C13.4 32.5 15.9 34 19.8 33.5Z';

const awsLogoSvg = (fill: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 125.4 75" fill="${fill}"><path fill-rule="evenodd" d="${AWS_LOGO_PATH}"/></svg>`;

export const AWS_SQUID_INK = '#161D26';

/** Black marks for neutral backgrounds such as the vendor picker. */
export const VENDOR_MARK_HREFS: Record<string, string> = {
  Google: svgDataUri(GOOGLE_LOGO_SVG),
  NVIDIA: svgDataUri(nvidiaEyeSvg('#000000')),
  AMD: svgDataUri(AMD_LOGO_SVG),
  OpenAI: svgDataUri(OPENAI_LOGO_SVG),
  AWS: svgDataUri(awsLogoSvg('#000000')),
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
  AWS: { href: onLabel(awsLogoSvg('#000000')), width: 16.5, height: 9.9 },
};

export interface AxisVendorLogoIcon extends VendorLogoIcon {
  monochrome: boolean;
  /** Separate dark-theme artwork; when set, it replaces `href` in dark mode instead of inverting. */
  darkHref?: string;
  /** Dark-theme class for color artwork that is flipped rather than swapped. */
  darkClassName?: string;
}

export interface VendorMarkVariant {
  href: string;
  className: string;
}

/** The image(s) to draw for a mark: a light/dark pair, an inverting monochrome mark, or a color mark. */
export function vendorMarkVariants(icon: AxisVendorLogoIcon): VendorMarkVariant[] {
  if (icon.darkHref) {
    return [
      { href: icon.href, className: 'dark:hidden' },
      { href: icon.darkHref, className: 'hidden dark:inline' },
    ];
  }
  return [
    {
      href: icon.href,
      className: icon.darkClassName ?? (icon.monochrome ? 'dark:invert' : ''),
    },
  ];
}

const NVIDIA_COLOR_LOGO_SVG = nvidiaEyeSvg('#76B900');

export const AXIS_VENDOR_LOGO_ICONS: Record<string, AxisVendorLogoIcon> = {
  Google: { href: svgDataUri(GOOGLE_LOGO_SVG), width: 10, height: 10, monochrome: true },
  NVIDIA: { href: svgDataUri(NVIDIA_COLOR_LOGO_SVG), width: 21, height: 14, monochrome: false },
  AMD: { href: svgDataUri(AMD_LOGO_SVG), width: 10, height: 10, monochrome: true },
  // The Amazon logo from the Nafea Bshara supporter quote, with the same hue-preserving dark flip.
  AWS: {
    href: '/logos/amazon.svg',
    width: 33.1,
    height: 10,
    monochrome: false,
    darkClassName: 'dark:invert dark:hue-rotate-180',
  },
};

export function getAxisVendorIcon(hwKey: string): AxisVendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? AXIS_VENDOR_LOGO_ICONS[vendor] : undefined;
}

export function getLineLabelVendorIcon(hwKey: string): VendorLogoIcon | undefined {
  const vendor = GPU_VENDORS[hwKey.split('_')[0]];
  return vendor ? VENDOR_LOGO_ICONS[vendor] : undefined;
}
