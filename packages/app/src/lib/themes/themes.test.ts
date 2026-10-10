// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chartPaletteTheme, hasDarkTheme, isDarkTheme, nextTheme } from './themes';

describe('standard themes', () => {
  it.each([
    ['light', 'dark'],
    ['system', 'light'],
    ['unknown', 'light'],
    [undefined, 'light'],
  ])('cycles %s to %s', (current, next) => {
    expect(nextTheme(current)).toBe(next);
  });

  it.each(['light', 'dark'])('preserves the %s chart palette', (theme) => {
    expect(chartPaletteTheme(theme)).toBe(theme);
  });

  it.each([
    ['light', false],
    ['dark', true],
    ['system', false],
    [undefined, false],
  ])('classifies %s for chart and figure contrast', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
    const element = document.createElement('div');
    element.className = `unrelated ${theme ?? ''}`;
    expect(hasDarkTheme(element)).toBe(expected);
  });
});
