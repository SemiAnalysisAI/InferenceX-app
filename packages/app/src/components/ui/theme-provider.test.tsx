// @test-environment jsdom
import { useTheme } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { APP_THEMES } from '@/lib/themes/themes';
import { hydrate, settle } from '@/test/dom';
import { ThemeProvider } from './theme-provider';

let container: HTMLElement;

function Probe() {
  return <span>{useTheme().theme}</span>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  document.documentElement.className = '';
  localStorage.clear();
});

async function renderSavedTheme(theme: string) {
  localStorage.setItem('theme', theme);
  document.documentElement.className = `test-font ${theme}`;
  // Hydrated like a page load, so next-themes' boot script is adopted rather than created.
  ({ container } = hydrate(
    <ThemeProvider attribute="class" themes={APP_THEMES} defaultTheme="dark">
      <Probe />
    </ThemeProvider>,
  ));
  await settle();
}

describe('saved standard theme preferences', () => {
  it.each(['light', 'dark', 'system'])('preserves the saved %s preference', async (theme) => {
    await renderSavedTheme(theme);
    expect(container.querySelector('span')?.textContent).toBe(theme);
    expect(localStorage.getItem('theme')).toBe(theme);
    expect(document.documentElement.classList.contains('test-font')).toBe(true);
  });
});
