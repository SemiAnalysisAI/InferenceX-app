import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import { generateHighContrastColors } from '@/lib/charts/chart-utils';
import { getChartThemeColors } from '@/lib/charts/chart-rendering';
import { generateVendorColors } from '@/lib/charts/dynamic-colors';

export interface UseThemeColorsOptions {
  highContrast: boolean;

  identifiers?: string[];

  activeKeys?: string[];

  hcKeys?: string[];

  hcVendorKeyFor?: (hcKey: string) => string;
}

export interface ThemeColors {
  rootStyles: CSSStyleDeclaration;
}

export interface UseThemeColorsResult {
  themeColors: ThemeColors;

  colorMap: Record<string, string> | null;

  vendorColorMap: Record<string, string> | null;

  resolveColor: (identifier: string, hardwareKey?: string) => string;

  getCssColor: (color: string) => string;
}

export function useThemeColors(options: UseThemeColorsOptions): UseThemeColorsResult {
  const { highContrast, identifiers = [], activeKeys, hcKeys, hcVendorKeyFor } = options;
  const { resolvedTheme } = useTheme();

  const [themeColors, setThemeColors] = useState<ThemeColors>(() => getChartThemeColors());

  const appliedThemeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resolvedTheme) return;
    if (appliedThemeRef.current === null) {
      appliedThemeRef.current = resolvedTheme;
      return;
    }
    if (appliedThemeRef.current === resolvedTheme) return;
    appliedThemeRef.current = resolvedTheme;
    const timeoutId = setTimeout(() => {
      setThemeColors(getChartThemeColors());
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [resolvedTheme]);

  const colorMap = useMemo(() => {
    if (!highContrast) return null;
    const usingHcKeys = hcKeys && hcKeys.length > 0;
    const keysForHc = usingHcKeys
      ? hcKeys
      : activeKeys && activeKeys.length > 0
        ? activeKeys
        : identifiers;
    if (keysForHc.length === 0) return null;
    return generateHighContrastColors(
      keysForHc,
      resolvedTheme || 'light',
      usingHcKeys ? hcVendorKeyFor : undefined,
    );
  }, [highContrast, hcKeys, hcVendorKeyFor, activeKeys, identifiers, resolvedTheme]);

  const vendorColorMap = useMemo(() => {
    if (!activeKeys || activeKeys.length === 0) return null;
    const theme = isDarkTheme(resolvedTheme) ? 'dark' : 'light';
    return generateVendorColors(activeKeys, theme);
  }, [activeKeys, resolvedTheme]);

  const resolveColor = useCallback(
    (identifier: string, hardwareKey?: string): string => {
      if (colorMap && identifier in colorMap) {
        return colorMap[identifier];
      }

      const lookupKey = hardwareKey || identifier;
      if (vendorColorMap && lookupKey in vendorColorMap) {
        return vendorColorMap[lookupKey];
      }

      return vendorColorMap ? 'var(--muted-foreground)' : 'var(--foreground)';
    },
    [colorMap, vendorColorMap],
  );

  const getCssColor = useCallback(
    (color: string): string => {
      if (color.startsWith('oklch(') || color.startsWith('hsl(') || color.startsWith('#')) {
        return color;
      }
      return themeColors.rootStyles.getPropertyValue(color).trim() || color;
    },
    [themeColors],
  );

  return {
    themeColors,
    colorMap,
    vendorColorMap,
    resolveColor,
    getCssColor,
  };
}
