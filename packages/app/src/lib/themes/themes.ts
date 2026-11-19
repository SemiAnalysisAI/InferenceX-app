export const APP_THEMES = [
  'light',
  'dark',
  'minecraft',
  'csgo',
  'gta',
  'doom',
  'halo',
  'orange-chicken',
  'excalidraw',
];

export function nextTheme(theme: string | undefined): string {
  return APP_THEMES[(APP_THEMES.indexOf(theme ?? '') + 1) % APP_THEMES.length];
}

const DARK_THEMES = new Set(['dark', 'minecraft', 'csgo', 'gta', 'doom', 'halo']);

const DARK_CHART_ALIASES = new Set(['csgo', 'gta', 'doom', 'halo']);

const LIGHT_CHART_ALIASES = new Set(['excalidraw', 'orange-chicken']);

/** Themes that render on a light canvas, for pre-hydration checks that only see `<html>` classes. */
export const LIGHT_THEMES = ['light', 'excalidraw', 'orange-chicken'];

export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

export function chartPaletteTheme(theme: string): string {
  if (DARK_CHART_ALIASES.has(theme)) return 'dark';
  if (LIGHT_CHART_ALIASES.has(theme)) return 'light';
  return theme;
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}
