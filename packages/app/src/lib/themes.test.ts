// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { APP_THEMES, hasDarkTheme, isDarkTheme, nextTheme } from './themes';
import { generateHighContrastColors } from './chart-utils';

describe('presentation themes', () => {
  it('cycles through all four themes and returns to light', () => {
    expect(APP_THEMES.map(nextTheme)).toEqual(['dark', 'minecraft', 'csgo', 'light']);
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme(undefined)).toBe('light');
    expect(nextTheme('unknown')).toBe('light');
  });

  it.each([
    ['light', false],
    ['dark', true],
    ['minecraft', true],
    ['csgo', true],
    ['system', false],
    [undefined, false],
  ])('classifies %s for chart and figure contrast', (theme, expected) => {
    expect(isDarkTheme(theme)).toBe(expected);
    const element = document.createElement('div');
    element.className = `unrelated ${theme ?? ''}`;
    expect(hasDarkTheme(element)).toBe(expected);
  });

  it('preserves the dark high-contrast palette in CS:GO for official and overlay keys', () => {
    const keys = ['b200_vllm', 'b300_vllm', 'mi355x_sglang', 'overlay-1', 'overlay-2'];
    expect(generateHighContrastColors(keys, 'csgo')).toEqual(
      generateHighContrastColors(keys, 'dark'),
    );
  });
});
