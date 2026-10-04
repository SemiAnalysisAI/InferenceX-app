/** Presentation themes; benchmark data and share URLs do not depend on these. */
export const APP_THEMES = ['light', 'dark', 'minecraft', 'csgo'];

export function isDarkTheme(theme: string | undefined): boolean {
  return theme === 'dark' || theme === 'minecraft' || theme === 'csgo';
}

export function nextTheme(theme: string | undefined): string {
  return APP_THEMES[(APP_THEMES.indexOf(theme ?? '') + 1) % APP_THEMES.length];
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}
