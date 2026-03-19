import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { generateHighContrastColors } from '@/lib/chart-utils';
import { getChartThemeColors } from '@/lib/chart-rendering';
import { HARDWARE_CONFIG } from '@/lib/constants';

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
   * Resolves color for a given identifier
   * - If highContrast, uses colorMap
   * - Otherwise, uses HARDWARE_CONFIG
   * - Falls back to HARDWARE_CONFIG.unknown.color if not found
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
  const { highContrast, identifiers = [], colorShuffleSeed = 0 } = options;
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
  const colorMap = useMemo(() => {
    if (!highContrast || identifiers.length === 0) {
      return null;
    }
    return generateHighContrastColors(identifiers, resolvedTheme || 'light', colorShuffleSeed);
  }, [highContrast, identifiers, resolvedTheme, colorShuffleSeed]);

  // color resolver function
  const resolveColor = useCallback(
    (identifier: string, hardwareKey?: string): string => {
      if (colorMap && identifier in colorMap) {
        return colorMap[identifier];
      }

      // fallback to hardware config
      const key = (hardwareKey || identifier) as keyof typeof HARDWARE_CONFIG;
      return HARDWARE_CONFIG[key]?.color || HARDWARE_CONFIG.unknown.color;
    },
    [colorMap],
  );

  // css color value resolver
  const getCssColor = useCallback(
    (color: string): string => {
      return themeColors.rootStyles.getPropertyValue(color).trim() || color;
    },
    [themeColors],
  );

  return {
    themeColors,
    colorMap,
    resolveColor,
    getCssColor,
  };
}
