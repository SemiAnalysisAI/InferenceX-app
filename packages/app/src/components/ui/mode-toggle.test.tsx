// @test-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'bun:test';

import { registerAnalyticsClient } from '@/lib/analytics/analytics';
import { APP_THEMES } from '@/lib/themes/themes';
import { click, eventually, focus, get, render } from '@/test/dom';

import { ModeToggle } from './mode-toggle';
import { ThemeProvider } from './theme-provider';

const capture = vi.fn();

describe('ModeToggle', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    localStorage.setItem('theme', 'light');
    registerAnalyticsClient({ capture });
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={APP_THEMES}
        disableTransitionOnChange
      >
        <ModeToggle />
      </ThemeProvider>,
    );
    expect(get('[data-testid="theme-toggle"]').getAttribute('aria-label')).toBe(
      'Switch theme (currently light mode)',
    );
  });

  it('switches from light to dark, persists the selection, and reports analytics', async () => {
    expect(get('[data-testid="theme-toggle"] svg').classList.contains('lucide-sun')).toBe(true);
    click(get('[data-testid="theme-toggle"]'));
    await eventually(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    const toggle = get('[data-testid="theme-toggle"]');
    expect(toggle.hasAttribute('aria-expanded')).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Switch theme (currently dark mode)');
    expect(get('svg', toggle).classList.contains('lucide-moon')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(capture).toHaveBeenCalledWith('theme_toggled', { theme: 'dark' });
  });

  it('keeps a native button and retains focus after activation', async () => {
    const toggle = get('[data-testid="theme-toggle"]');
    expect(toggle.tagName).toBe('BUTTON');
    focus(toggle);
    click(toggle);
    await eventually(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect((document.activeElement as HTMLElement | null)?.dataset.testid).toBe('theme-toggle');
  });
});
