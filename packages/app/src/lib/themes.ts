/** Presentation themes; benchmark data and share URLs do not depend on these. */
export const APP_THEMES = ['light', 'dark'];

/** Themes that draw on the dark palette (charts, figures, exports). */
const DARK_THEMES = new Set(['dark']);

export function isDarkTheme(theme: string | undefined): boolean {
  return theme !== undefined && DARK_THEMES.has(theme);
}

/** Chart palette seed for a theme. */
export function chartPaletteTheme(theme: string): string {
  return theme;
}

export function hasDarkTheme(element: Element): boolean {
  return [...element.classList].some(isDarkTheme);
}

/**
 * Runs before next-themes' boot script and resets a saved theme that no longer
 * exists (the retired decorative themes) to the dark default.
 */
export const retiredThemePrepaintScript = `try{var k='theme',t=localStorage.getItem(k);if(t&&t!=='system'&&${JSON.stringify(APP_THEMES)}.indexOf(t)<0)localStorage.setItem(k,'dark')}catch(e){}`;
