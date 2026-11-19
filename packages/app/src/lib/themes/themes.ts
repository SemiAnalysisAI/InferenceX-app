/** `semianalysis` is the site theme; `light` and `dark` remain only for embeds that request them. */
export const SITE_THEME = 'semianalysis';

export const APP_THEMES = ['light', 'dark', SITE_THEME];

const DARK_THEMES = new Set(['dark']);

const LIGHT_CHART_ALIASES = new Set([SITE_THEME]);

/** Themes that render on a light canvas, for pre-hydration checks that only see `<html>` classes. */
export const LIGHT_THEMES = ['light', SITE_THEME];

export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

export function chartPaletteTheme(theme: string): string {
  return LIGHT_CHART_ALIASES.has(theme) ? 'light' : theme;
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}
