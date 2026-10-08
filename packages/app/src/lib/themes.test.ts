// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { APP_THEMES, chartPaletteTheme, hasDarkTheme, isDarkTheme } from './themes';

describe('presentation themes', () => {
  it('lists every picker theme in display order', () => {
    expect(APP_THEMES).toEqual(['light', 'dark']);
  });

  it('seeds chart palettes from the theme itself', () => {
    expect(APP_THEMES.map(chartPaletteTheme)).toEqual(['light', 'dark']);
  });

  it.each([
    ['light', false],
    ['dark', true],
    ['minecraft', false],
    ['system', false],
    [undefined, false],
  ])('classifies %s for chart and figure contrast', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
    const element = document.createElement('div');
    element.className = `unrelated ${theme ?? ''}`;
    expect(hasDarkTheme(element)).toBe(expected);
  });
});
