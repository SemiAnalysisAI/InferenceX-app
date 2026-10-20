import { DEPLOYMENT_FLAGS } from '@/lib/config/deployment-flags';

export const OPTIONAL_THEMES = ['minecraft', 'csgo', 'gta', 'doom', 'halo'] as const;
export type OptionalTheme = (typeof OPTIONAL_THEMES)[number];

export const DISABLED_THEMES: readonly OptionalTheme[] = OPTIONAL_THEMES.filter((theme) =>
  DEPLOYMENT_FLAGS.disabledThemes.includes(theme),
);
export const ENABLED_OPTIONAL_THEMES: readonly OptionalTheme[] = OPTIONAL_THEMES.filter(
  (theme) => !DISABLED_THEMES.includes(theme),
);

export const APP_THEMES: string[] = ['light', 'dark', ...ENABLED_OPTIONAL_THEMES];

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
