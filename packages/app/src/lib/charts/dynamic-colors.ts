import { rgb } from 'd3';

import {
  GOOGLE_BLUE,
  HUAWEI_CHART_COLORS,
  GPU_VENDORS,
  VENDOR_OKLCH_ZONES,
} from '@semianalysisai/inferencex-constants';
import { getModelSortIndex } from '@/lib/catalog/constants';

export type Vendor = 'nvidia' | 'amd' | 'openai' | 'google' | 'huawei' | 'unknown';

export function getVendor(hwKey: string): Vendor {
  const normalized = hwKey.trim().toLowerCase();
  if (/^(?:huawei|ascend)(?=\d|[\s_-]|$)/u.test(normalized)) return 'huawei';
  const base = normalized.split('_')[0];
  if (base === 'nvidia' || base === 'amd' || base === 'openai' || base === 'google') return base;
  const vendor = GPU_VENDORS[base];
  if (vendor === 'NVIDIA') return 'nvidia';
  if (vendor === 'AMD') return 'amd';
  if (vendor === 'OpenAI') return 'openai';
  if (vendor === 'Google') return 'google';
  return 'unknown';
}

const LIGHTNESS = {
  light: { min: 0.38, max: 0.74 },
  dark: { min: 0.6, max: 0.88 },
} as const;

function pickLightness(index: number, count: number, theme: 'light' | 'dark'): number {
  const { min, max } = LIGHTNESS[theme];
  if (count <= 1) return (min + max) / 2;
  return max - (index / (count - 1)) * (max - min);
}

export function generateVendorColors(
  activeKeys: string[],
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};

  const groups = new Map<Vendor, string[]>();
  for (const key of activeKeys) {
    const vendor = getVendor(key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  for (const [vendor, keys] of groups) {
    keys.sort((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b));

    const zone = VENDOR_OKLCH_ZONES[vendor];
    const chroma = zone.chroma[theme];
    const count = keys.length;
    if (vendor === 'huawei' && count === 1) {
      result[keys[0]] = HUAWEI_CHART_COLORS[theme];
      continue;
    }
    if (vendor === 'google' && count === 1) {
      result[keys[0]] = GOOGLE_BLUE;
      continue;
    }

    for (let i = 0; i < count; i++) {
      const hue =
        count <= 1
          ? (zone.start + zone.end) / 2
          : zone.start + ((i + 0.5) / count) * (zone.end - zone.start);

      const lightness = pickLightness(i, count, theme);
      result[keys[i]] = `oklch(${lightness.toFixed(3)} ${chroma} ${hue.toFixed(1)})`;
    }
  }

  return result;
}

export const VENDOR_LABELS: Record<Vendor, string> = {
  nvidia: 'NVIDIA',
  amd: 'AMD',
  openai: 'OpenAI',
  google: 'Google',
  huawei: 'Huawei',
  unknown: 'Unknown',
};

const VENDOR_BRAND_COLORS: Partial<Record<Vendor, string>> = {
  nvidia: '#76b900',
  amd: '#ed1c24',
};

export function vendorColor(vendor: Vendor, theme: 'light' | 'dark'): string {
  return VENDOR_BRAND_COLORS[vendor] ?? generateVendorColors([vendor], theme)[vendor];
}

export function generateGpuDateColors(
  gpuKeys: string[],
  dateCount: number,
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};

  const groups = new Map<Vendor, string[]>();
  for (const key of gpuKeys) {
    const vendor = getVendor(key);
    let list = groups.get(vendor);
    if (!list) {
      list = [];
      groups.set(vendor, list);
    }
    list.push(key);
  }

  const { min: lMin, max: lMax } = LIGHTNESS[theme];

  for (const [vendor, keys] of groups) {
    keys.sort((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b));

    const zone = VENDOR_OKLCH_ZONES[vendor];
    const chroma = zone.chroma[theme];
    const gpuCount = keys.length;
    const fixedColor =
      gpuCount === 1
        ? vendor === 'google'
          ? GOOGLE_BLUE
          : vendor === 'huawei'
            ? HUAWEI_CHART_COLORS[theme]
            : null
        : null;
    const fixedBase = fixedColor ? hexToOklch(fixedColor) : null;

    for (let gi = 0; gi < gpuCount; gi++) {
      const hue =
        fixedBase?.[2] ??
        (gpuCount <= 1
          ? (zone.start + zone.end) / 2
          : zone.start + ((gi + 0.5) / gpuCount) * (zone.end - zone.start));

      for (let di = 0; di < dateCount; di++) {
        const lightness =
          dateCount <= 1 ? (lMin + lMax) / 2 : lMax - (di / (dateCount - 1)) * (lMax - lMin);
        const compositeKey = `${di}_${keys[gi]}`;
        result[compositeKey] =
          fixedBase && dateCount === 1
            ? fixedColor!
            : `oklch(${lightness.toFixed(3)} ${fixedBase?.[1] ?? chroma} ${hue.toFixed(1)})`;
      }
    }
  }

  return result;
}

const HC_DATE_L_SPAN = 0.36;

const HC_DATE_L_BOUNDS = {
  light: { min: 0.34, max: 0.86 },
  dark: { min: 0.44, max: 0.95 },
} as const;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToOklch(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join('') : raw;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/iu.test(full)) return null;

  const r = srgbToLinear(Number.parseInt(full.slice(0, 2), 16) / 255);
  const g = srgbToLinear(Number.parseInt(full.slice(2, 4), 16) / 255);
  const b = srgbToLinear(Number.parseInt(full.slice(4, 6), 16) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(okA, okB);
  const hue = ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;
  return [okL, chroma, hue];
}

export function generateHighContrastGpuDateColors(
  baseColors: Record<string, string>,
  dateCount: number,
  theme: 'light' | 'dark',
): Record<string, string> {
  const result: Record<string, string> = {};
  if (dateCount <= 0) return result;

  const { min: lMin, max: lMax } = HC_DATE_L_BOUNDS[theme];

  for (const [hwKey, base] of Object.entries(baseColors)) {
    const oklch = hexToOklch(base);
    if (!oklch) {
      for (let di = 0; di < dateCount; di++) result[`${di}_${hwKey}`] = base;
      continue;
    }
    const [baseL, chroma, hue] = oklch;

    const span = Math.min(HC_DATE_L_SPAN, lMax - lMin);
    let top = Math.min(lMax, baseL + span / 2);
    let bottom = top - span;
    if (bottom < lMin) {
      bottom = lMin;
      top = bottom + span;
    }

    for (let di = 0; di < dateCount; di++) {
      const lightness = dateCount <= 1 ? baseL : top - (di / (dateCount - 1)) * span;
      result[`${di}_${hwKey}`] =
        `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
    }
  }

  return result;
}

const OKLCH_PATTERN = /^oklch\(\s*(?<l>[\d.]+)\s+(?<c>[\d.]+)\s+(?<h>[\d.]+)\s*\)$/u;

/**
 * Lighter/darker variant of an `oklch(L C H)` color for the nth series that shares one
 * hardware color: 0 keeps the base, then alternates darker/lighter in widening steps.
 * Non-oklch colors are returned unchanged.
 */
export function shadeOklch(color: string, index: number): string {
  if (index <= 0) return color;
  const groups = OKLCH_PATTERN.exec(color)?.groups;
  if (!groups) return color;
  const step = Math.ceil(index / 2) * 0.09 * (index % 2 === 1 ? -1 : 1);
  const lightness = Math.min(0.92, Math.max(0.3, Number(groups.l) + step));
  return `oklch(${lightness.toFixed(3)} ${groups.c} ${groups.h})`;
}

function oklchToLinearSrgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const lc = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mc = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sc = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * lc - 3.307_711_591_3 * mc + 0.230_969_929_2 * sc,
    -1.268_438_004_6 * lc + 2.609_757_401_1 * mc - 0.341_319_396_5 * sc,
    -0.004_196_086_3 * lc - 0.703_418_614_7 * mc + 1.707_614_701 * sc,
  ];
}

function srgbToOklch(color: string): [number, number, number] | null {
  const parsed = rgb(color);
  if (Number.isNaN(parsed.r)) return null;
  const [r, g, b] = [parsed.r, parsed.g, parsed.b].map((channel) => {
    const v = channel / 255;
    return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lc = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const mc = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const sc = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  const a = 1.977_998_495_1 * lc - 2.428_592_205 * mc + 0.450_593_709_9 * sc;
  const bb = 0.025_904_037_1 * lc + 0.782_771_766_2 * mc - 0.808_675_766 * sc;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return [
    0.210_454_255_3 * lc + 0.793_617_785 * mc - 0.004_072_046_8 * sc,
    Math.hypot(a, bb),
    hue < 0 ? hue + 360 : hue,
  ];
}

function gamutChroma(l: number, c: number, h: number): number {
  const fits = (chroma: number) =>
    oklchToLinearSrgb(l, chroma, h).every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
  if (fits(c)) return c;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function oklchLuminance(l: number, c: number, h: number): number {
  const [r, g, b] = oklchToLinearSrgb(l, c, h).map((channel) => Math.min(1, Math.max(0, channel)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const WHITE_TEXT_MIN_CONTRAST = 4.6;
const WHITE_TEXT_MAX_LUMINANCE = 1.05 / WHITE_TEXT_MIN_CONTRAST - 0.05;
const whiteTextFills = new Map<string, string>();

export function whiteTextFill(color: string): string {
  const cached = whiteTextFills.get(color);
  if (cached) return cached;
  const groups = OKLCH_PATTERN.exec(color)?.groups;
  const lch = groups ? [Number(groups.l), Number(groups.c), Number(groups.h)] : srgbToOklch(color);
  let fill = color;
  if (lch) {
    const [l, c, h] = lch;
    const luminanceAt = (lightness: number) =>
      oklchLuminance(lightness, gamutChroma(lightness, c, h), h);
    if (luminanceAt(l) > WHITE_TEXT_MAX_LUMINANCE) {
      let lo = 0;
      let hi = l;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (luminanceAt(mid) <= WHITE_TEXT_MAX_LUMINANCE) lo = mid;
        else hi = mid;
      }
      const lightness = Math.floor(lo * 1000) / 1000;
      const chroma = Math.floor(gamutChroma(lightness, c, h) * 1000) / 1000;
      fill = `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${h.toFixed(1)})`;
    }
  }
  whiteTextFills.set(color, fill);
  return fill;
}
