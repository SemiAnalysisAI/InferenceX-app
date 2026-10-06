/** Presentation themes; benchmark data and share URLs do not depend on these. */
export const APP_THEMES = ['light', 'dark', 'minecraft', 'csgo', 'gta', 'kart'];

/** Themes that draw on the dark palette (charts, figures, exports). */
const DARK_THEMES = new Set(['dark', 'minecraft', 'csgo', 'gta', 'kart']);

/** Themes that reuse the plain dark chart seed instead of their own palette. */
const DARK_CHART_ALIASES = new Set(['csgo', 'gta', 'kart']);

export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

/** Map decorative dark themes onto the dark chart palette seed. */
export function chartPaletteTheme(theme: string): string {
  return DARK_CHART_ALIASES.has(theme) ? 'dark' : theme;
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}
