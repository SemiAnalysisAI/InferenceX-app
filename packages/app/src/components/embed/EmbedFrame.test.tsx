// @vitest-environment jsdom
import { ThemeProvider } from 'next-themes';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_THEMES } from '@/lib/themes/themes';

import EmbedFrame from './EmbedFrame';

let container: HTMLDivElement;
let root: Root;

function renderEmbed(theme: 'light' | 'dark'): void {
  act(() =>
    root.render(
      createElement(
        ThemeProvider,
        { attribute: 'class', defaultTheme: 'light', themes: [...APP_THEMES] },
        createElement(EmbedFrame, { theme, skin: undefined, children: 'chart' }),
      ),
    ),
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
