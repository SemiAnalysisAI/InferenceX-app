// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTheme } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_THEMES } from '@/lib/themes/themes';
import { ThemeProvider } from './theme-provider';

let container: HTMLDivElement;
let root: Root;

function Probe() {
  return <span>{useTheme().theme}</span>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
  localStorage.clear();
});

async function renderSavedTheme(theme: string) {
  localStorage.setItem('theme', theme);
  document.documentElement.className = `test-font ${theme}`;
  await act(() => {
    root.render(
      <ThemeProvider attribute="class" themes={APP_THEMES} defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    );
  });
}

describe('saved standard theme preferences', () => {
  it.each(['light', 'dark', 'system'])('preserves the saved %s preference', async (theme) => {
    await renderSavedTheme(theme);
    expect(container.querySelector('span')?.textContent).toBe(theme);
    expect(localStorage.getItem('theme')).toBe(theme);
    expect(document.documentElement.classList.contains('test-font')).toBe(true);
  });
});
