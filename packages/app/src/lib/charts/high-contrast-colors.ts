import {
  GOOGLE_BLUE,
  HUAWEI_CHART_COLORS,
  HUAWEI_CHART_PALETTE,
} from '@semianalysisai/inferencex-constants';
import iwanthue from 'iwanthue';

import { getVendor, type Vendor } from '@/lib/charts/dynamic-colors';
import { chartPaletteTheme, isDarkTheme } from '@/lib/themes/themes';

const BANNED_HUE_TEST: Record<Vendor, ((hue: number) => boolean) | null> = {
  nvidia: (hue) => hue >= 320 || hue <= 40,
  amd: (hue) => hue >= 120 && hue <= 195,
  openai: (hue) => hue < 290 || hue > 350,
  google: (hue) => hue < 255 || hue > 300,
  huawei: null,
  unknown: null,
};

const PREFERRED_ZONE: Record<
  Vendor,
  { hmin: number; hmax: number; cmin?: number; lmin?: number } | null
> = {
  nvidia: { hmin: 100, hmax: 195 },
  amd: { hmin: 20, hmax: 50, cmin: 70, lmin: 50 },
  openai: { hmin: 300, hmax: 340 },
  google: { hmin: 265, hmax: 295 },
  huawei: HUAWEI_CHART_PALETTE.lab,
  unknown: null,
};

const PREFERRED_MAX = 4;

const BAN_MAX = 10;

const PALETTE_CACHE = new Map<string, string[]>();

export const generateHighContrastColors = (
  keys: string[],
  theme: string,
  vendorKeyFor?: (key: string) => string,
): Record<string, string> => {
  if (keys.length === 0) return {};
  theme = chartPaletteTheme(theme);

  const colors: Record<string, string> = {};
  const [lmin, lmax] = isDarkTheme(theme) ? [50, 100] : [30, 65];

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

  const multiVendor = groups.size > 1;
  const reserveHuawei = groups.has('huawei');

  for (const [vendor, vendorKeys] of groups) {
    const count = vendorKeys.length;
    if (vendor === 'huawei' && count === 1) {
      colors[vendorKeys[0]] = HUAWEI_CHART_COLORS[isDarkTheme(theme) ? 'dark' : 'light'];
      continue;
    }
    if (vendor === 'google' && count === 1) {
      colors[vendorKeys[0]] = GOOGLE_BLUE;
      continue;
    }
    const isBanned = BANNED_HUE_TEST[vendor] ?? null;
    const preferred = PREFERRED_ZONE[vendor] ?? null;

    const usePreferred =
      preferred && ((multiVendor && count <= PREFERRED_MAX) || vendor === 'huawei');
    const useBan = multiVendor && !usePreferred && isBanned && count <= BAN_MAX;

    const excludeAmber = reserveHuawei && vendor !== 'huawei';
    const mode = usePreferred ? 'pref' : useBan ? 'ban' : 'open';
    const cacheKey = `${vendor}|${theme}|${count}|${mode}|${lmin}|${lmax}|${excludeAmber}`;

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
        ...((useBan || excludeAmber) && {
          colorFilter: (_rgb: [number, number, number], lab: [number, number, number]) => {
            if (lab[0] < lmin || lab[0] > lmax) return false;
            const hue = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
            return (
              !(useBan && isBanned?.(hue)) &&
              !(
                excludeAmber &&
                hue >= HUAWEI_CHART_PALETTE.reservedLab.hmin &&
                hue <= HUAWEI_CHART_PALETTE.reservedLab.hmax
              )
            );
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
