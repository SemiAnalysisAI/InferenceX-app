// @test-environment jsdom
import { ThemeProvider } from 'next-themes';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'bun:test';

import { APP_THEMES } from '@/lib/themes/themes';
import { hydrate } from '@/test/dom';

import EmbedFrame from './EmbedFrame';

/** Hydrated like the embed page load, so the boot scripts are adopted rather than created. */
function renderEmbed(theme: 'light' | 'dark'): void {
  hydrate(
    createElement(
      ThemeProvider,
      { attribute: 'class', defaultTheme: 'light', themes: [...APP_THEMES] },
      createElement(EmbedFrame, { theme, skin: undefined, children: 'chart' }),
    ),
  );
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

describe('EmbedFrame theme', () => {
  it("applies the embed theme without overwriting the visitor's light or dark choice", () => {
    localStorage.setItem('theme', 'light');
    renderEmbed('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('leaves no saved theme behind for a visitor who never chose one', () => {
    renderEmbed('dark');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('replaces a saved optional theme with the embed theme', () => {
    localStorage.setItem('theme', 'minecraft');
    renderEmbed('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
