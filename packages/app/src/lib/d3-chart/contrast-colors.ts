/** Relative luminance (WCAG 2.x simplified). */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

let _probeCtx: CanvasRenderingContext2D | null = null;

/** Parse any CSS color to [r, g, b] using a canvas probe. */
function parseRgb(color: string): [number, number, number] | null {
  if (!_probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    _probeCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!_probeCtx) return null;
  }
  _probeCtx.clearRect(0, 0, 1, 1);
  _probeCtx.fillStyle = color;
  _probeCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = _probeCtx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/**
 * Returns the optimal text color for overlaying on a given background color.
 * Resolves CSS variables (e.g. `var(--h100)`) via getComputedStyle.
 * Handles any CSS color format (hex, rgb, oklch, hsl, etc.) via canvas probe.
 * Light backgrounds → dark text; dark backgrounds → white text.
 */
export function contrastColors(bgColor: string): string {
  let resolved = bgColor;
  if (bgColor.startsWith('var(')) {
    const varName = bgColor.slice(4, -1).trim();
    resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  const rgb = parseRgb(resolved);
  if (!rgb) return 'white';
  const lum = relativeLuminance(...rgb);
  return lum > 0.3 ? '#131416' : 'white';
}

type Rgb = [number, number, number];

/** WCAG 2.x contrast ratio between two sRGB colours (0–255 channels). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.003_130_8 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** sRGB → OKLab. */
function rgbToOklab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.412_221_470_8 * lr + 0.536_332_536_3 * lg + 0.051_445_992_9 * lb);
  const m = Math.cbrt(0.211_903_498_2 * lr + 0.680_699_545_1 * lg + 0.107_396_956_6 * lb);
  const s = Math.cbrt(0.088_302_461_9 * lr + 0.281_718_837_6 * lg + 0.629_978_700_5 * lb);
  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
}

/** OKLab → sRGB, clamped to the sRGB gamut. */
function oklabToRgb([L, a, b]: [number, number, number]): Rgb {
  const l = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (L - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    fromLinear(4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s),
    fromLinear(-1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s),
    fromLinear(-0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s),
  ];
}

/**
 * Shift `color`'s OKLab lightness — keeping its hue and chroma — until it
 * reaches `minRatio` contrast against `background`: darker on light
 * backgrounds, lighter on dark ones. Returns the colour unchanged when it
 * already passes.
 */
export function adjustForContrast(color: Rgb, background: Rgb, minRatio = 4.5): Rgb {
  if (contrastRatio(color, background) >= minRatio) return color;
  const [L, a, b] = rgbToOklab(color);
  const darken = relativeLuminance(...background) > 0.18;
  for (let step = 1; step <= 100; step++) {
    const next = Math.min(1, Math.max(0, L + (darken ? -step : step) * 0.01));
    const candidate = oklabToRgb([next, a, b]);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
    if (next === 0 || next === 1) return candidate;
  }
  return color;
}

/**
 * Text colour for a series name drawn straight on the chart: the series
 * colour where it is legible, otherwise the same hue made lighter or darker
 * until it meets WCAG AA (4.5:1) on `background`. Accepts any CSS colour;
 * returns the input untouched when it cannot be parsed.
 */
export function readableTextColor(color: string, background: string, minRatio = 4.5): string {
  const fg = parseRgb(color);
  const bg = parseRgb(background);
  if (!fg || !bg) return color;
  const out = adjustForContrast(fg, bg, minRatio);
  return out === fg ? color : `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [17, 17, 19];
const rgbString = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

/**
 * Text colours for a label drawn inside a filled box: `primary` is white or
 * near-black, whichever contrasts more with `background`; `secondary` is a
 * softer tone of it for supporting text (the serving engine), still at
 * least 4.5:1 so it reads at body size.
 */
export function boxTextColors(background: string): { primary: string; secondary: string } {
  const bg = parseRgb(background);
  if (!bg) return { primary: 'white', secondary: '#d1d5db' };
  const { primary, secondary } = boxTextRgb(bg);
  return { primary: rgbString(primary), secondary: rgbString(secondary) };
}

/** `boxTextColors` on parsed sRGB channels. */
export function boxTextRgb(bg: Rgb): { primary: Rgb; secondary: Rgb } {
  const primary = contrastRatio(WHITE, bg) >= contrastRatio(INK, bg) ? WHITE : INK;
  const soft = primary.map((c, i) => Math.round(c * 0.75 + bg[i] * 0.25)) as Rgb;
  return { primary, secondary: adjustForContrast(soft, bg) };
}
