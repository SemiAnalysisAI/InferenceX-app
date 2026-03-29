import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { generateHighContrastColors } from '@/lib/chart-utils';
import { getChartThemeColors } from '@/lib/chart-rendering';
import { generateVendorColors } from '@/lib/dynamic-colors';

export interface UseThemeColorsOptions {
  /**
   * Enable high contrast colors
   */
  highContrast: boolean;

  /**
   * List of identifiers to generate high contrast colors for
   * (e.g., model names, configuration labels, hardware keys)
   */
  identifiers?: string[];

  /**
   * Seed for shuffling high contrast color assignments.
   * 0 (default) means no shuffle; any other value produces a deterministic shuffle.
   */
  colorShuffleSeed?: number;

  /**
   * Hardware keys that are currently checked / active in the legend.
   * When provided, dynamic vendor-aware colors are generated for these keys
   * instead of falling back to static HARDWARE_CONFIG.color values.
   */
  activeKeys?: string[];
}

export interface ThemeColors {
  /** Root CSS styles for dynamic color variable lookups */
  rootStyles: CSSStyleDeclaration;
}

export interface UseThemeColorsResult {
  /** Base theme colors for chart rendering */
  themeColors: ThemeColors;

  /**
   * High contrast color map (null if highContrast is false)
   * Maps identifier -> color string
   */
  colorMap: Record<string, string> | null;

  /**
   * Dynamic vendor-aware color map (null if activeKeys not provided)
   * Maps hwKey -> oklch color string
   */
  vendorColorMap: Record<string, string> | null;

  /**
   * Resolves color for a given identifier
   * Priority: highContrast colorMap → vendorColorMap → HARDWARE_CONFIG fallback
   * @param identifier - The identifier to resolve color for
   * @param hardwareKey - Optional hardware key for fallback lookup
   */
  resolveColor: (identifier: string, hardwareKey?: string) => string;

  /**
   * Resolves and returns the actual hex/rgb color value from CSS variables
   * @param color - Color string (may be CSS variable like 'var(--gpu-h100)')
   */
  getCssColor: (color: string) => string;
}

/**
 * Hook for managing chart theme colors and high contrast mode
 * Consolidates common theme color patterns across all D3 charts
 */
export function useThemeColors(options: UseThemeColorsOptions): UseThemeColorsResult {
  const { highContrast, identifiers = [], colorShuffleSeed = 0, activeKeys } = options;
  const { resolvedTheme } = useTheme();

  // get base theme colors
  const [themeColors, setThemeColors] = useState<ThemeColors>(() => getChartThemeColors());

  // update theme colors on next tick
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setThemeColors(getChartThemeColors());
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [resolvedTheme]);

  // generate high contrast color map if enabled
  // Use activeKeys when available so only visible items get hues — fewer items = more separation
  const colorMap = useMemo(() => {
    if (!highContrast) return null;
    const keysForHc = activeKeys && activeKeys.length > 0 ? activeKeys : identifiers;
    if (keysForHc.length === 0) return null;
    return generateHighContrastColors(keysForHc, resolvedTheme || 'light', colorShuffleSeed);
  }, [highContrast, activeKeys, identifiers, resolvedTheme, colorShuffleSeed]);

  // generate dynamic vendor-aware colors for active keys
  const vendorColorMap = useMemo(() => {
    if (!activeKeys || activeKeys.length === 0) return null;
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
    return generateVendorColors(activeKeys, theme);
  }, [activeKeys, resolvedTheme]);

  // color resolver function
  const resolveColor = useCallback(
    (identifier: string, hardwareKey?: string): string => {
      // 1. High contrast takes priority
      if (colorMap && identifier in colorMap) {
        return colorMap[identifier];
      }

      // 2. Dynamic vendor colors
      const lookupKey = hardwareKey || identifier;
      if (vendorColorMap && lookupKey in vendorColorMap) {
        return vendorColorMap[lookupKey];
      }

      // 3. Fallback — muted when dynamic system is active (inactive items),
      //    otherwise foreground
      return vendorColorMap ? 'var(--muted-foreground)' : 'var(--foreground)';
    },
    [colorMap, vendorColorMap],
  );

  // css color value resolver
  const getCssColor = useCallback(
    (color: string): string => {
      // oklch(...) strings are already resolved — pass through
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
