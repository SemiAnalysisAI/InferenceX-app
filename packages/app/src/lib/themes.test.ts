// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { APP_THEMES, chartPaletteTheme, hasDarkTheme, isDarkTheme, nextTheme } from './themes';
import { generateHighContrastColors } from './chart-utils';

describe('presentation themes', () => {
  it('lists every theme in toggle order', () => {
    expect(APP_THEMES).toEqual(['light', 'dark', 'minecraft', 'csgo', 'gta', 'doom', 'halo']);
  });

  it.each([
    ['light', 'dark'],
    ['dark', 'minecraft'],
    ['minecraft', 'csgo'],
    ['csgo', 'gta'],
    ['gta', 'doom'],
    ['doom', 'halo'],
    ['halo', 'light'],
    ['system', 'light'],
    ['unknown', 'light'],
    [undefined, 'light'],
  ])('cycles %s to %s', (current, next) => {
    expect(nextTheme(current)).toBe(next);
  });

  it('aliases decorative dark themes onto the dark chart seed only', () => {
    expect(APP_THEMES.map(chartPaletteTheme)).toEqual([
      'light',
      'dark',
      'minecraft',
      'dark',
      'dark',
      'dark',
      'dark',
    ]);
  });

  it.each([
    ['light', false],
    ['dark', true],
    ['minecraft', true],
    ['csgo', true],
    ['gta', true],
    ['kart', false],
    ['doom', true],
    ['halo', true],
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

  it('preserves the dark high-contrast palette in GTA for official and overlay keys', () => {
    const keys = ['b200_vllm', 'b300_vllm', 'mi355x_sglang', 'overlay-1', 'overlay-2'];
    expect(generateHighContrastColors(keys, 'gta')).toEqual(
      generateHighContrastColors(keys, 'dark'),
    );
  });

  it('preserves the dark high-contrast palette in Doom for official and overlay keys', () => {
    const keys = ['b200_vllm', 'b300_vllm', 'mi355x_sglang', 'overlay-1', 'overlay-2'];
    expect(generateHighContrastColors(keys, 'doom')).toEqual(
      generateHighContrastColors(keys, 'dark'),
    );
  });

  it('preserves the dark high-contrast palette in Halo for official and overlay keys', () => {
    const keys = ['b200_vllm', 'b300_vllm', 'mi355x_sglang', 'overlay-1', 'overlay-2'];
    expect(generateHighContrastColors(keys, 'halo')).toEqual(
      generateHighContrastColors(keys, 'dark'),
    );
  });
});
