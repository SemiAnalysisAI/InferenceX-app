// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPTIONAL_THEMES, chartPaletteTheme, hasDarkTheme, isDarkTheme, nextTheme } from './themes';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

describe('deployment-disabled optional themes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    document.documentElement.className = '';
  });

  it('leave the rotation while ids that are not optional themes are ignored', async () => {
    const [disabled, ...enabled] = OPTIONAL_THEMES;
    vi.stubEnv('NEXT_PUBLIC_DISABLED_THEMES', ` ${disabled.toUpperCase()} , light,dark, unknown`);
    // The list is a build-time flag read when the module loads.
    vi.resetModules();
    const themes = await import('./themes');

    expect(themes.DISABLED_THEMES).toEqual([disabled]);
    expect(themes.ENABLED_OPTIONAL_THEMES).toEqual(enabled);
    expect(themes.APP_THEMES).toEqual(['light', 'dark', ...enabled]);
    expect(themes.nextTheme(disabled)).toBe('light');
  });

  it('never reports a disabled theme as active, so its optional code never loads', async () => {
    const [disabled, enabled] = OPTIONAL_THEMES;
    vi.stubEnv('NEXT_PUBLIC_DISABLED_THEMES', disabled);
    // The list is a build-time flag read when the modules load.
    vi.resetModules();
    const { useEasterEggTheme } = await import('./use-easter-egg-theme');
    let active: string | null | undefined;
    function Probe() {
      active = useEasterEggTheme();
      return null;
    }

    for (const [className, expected] of [
      [disabled, null],
      [enabled, enabled],
    ] as const) {
      document.documentElement.className = className;
      const root = createRoot(document.createElement('div'));
      act(() => root.render(createElement(Probe)));
      expect(active).toBe(expected);
      act(() => root.unmount());
    }
  });
});
