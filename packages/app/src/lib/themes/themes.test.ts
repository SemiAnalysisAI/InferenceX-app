// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chartPaletteTheme, hasDarkTheme, isDarkTheme } from './themes';

describe('themes', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['semianalysis', 'light'],
  ])('maps the %s chart palette to %s', (theme, palette) => {
    expect(chartPaletteTheme(theme)).toBe(palette);
  });

  it.each([
    ['light', false],
    ['dark', true],
    ['semianalysis', false],
    ['system', false],
    [undefined, false],
  ])('classifies %s for chart and figure contrast', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
    const element = document.createElement('div');
    element.className = `unrelated ${theme ?? ''}`;
    expect(hasDarkTheme(element)).toBe(expected);
  });
});
