export const APP_THEMES = ['light', 'dark', 'minecraft', 'csgo', 'gta', 'doom', 'halo'];

export function nextTheme(theme: string | undefined): string {
  return APP_THEMES[(APP_THEMES.indexOf(theme ?? '') + 1) % APP_THEMES.length];
}

const DARK_THEMES = new Set(['dark', 'minecraft', 'csgo', 'gta', 'doom', 'halo']);

const DARK_CHART_ALIASES = new Set(['csgo', 'gta', 'doom', 'halo']);

export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

export function chartPaletteTheme(theme: string): string {
  return DARK_CHART_ALIASES.has(theme) ? 'dark' : theme;
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}
