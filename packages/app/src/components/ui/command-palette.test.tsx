// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

import { CommandPalette } from '@/components/ui/command-palette';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockPathname = '/';
  push.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(React.createElement(CommandPalette));
  });
}

function openViaTrigger() {
  const trigger = container.querySelector(
    '[data-testid="command-palette-trigger"]',
  ) as HTMLButtonElement;
  act(() => trigger.click());
}

// React controlled inputs ignore direct `.value` assignment; use the native
// setter so React sees the change (same pattern as searchable-select.test.ts).
function setQuery(value: string) {
  const input = document.body.querySelector(
    '[data-testid="command-palette-input"]',
  ) as HTMLInputElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressOnInput(key: string) {
  const input = document.body.querySelector(
    '[data-testid="command-palette-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function optionLabels(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? '');
}

describe('CommandPalette', () => {
  it('opens from the trigger button and lists grouped destinations', () => {
    render();
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull();
    openViaTrigger();
    expect(document.body.querySelector('[data-testid="command-palette"]')).not.toBeNull();
    const labels = optionLabels();
    expect(labels.some((label) => label.includes('Home'))).toBe(true);
    expect(labels.some((label) => label.includes('NVIDIA B300'))).toBe(true);
  });

  it('opens on Ctrl+K', () => {
    render();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(document.body.querySelector('[data-testid="command-palette"]')).not.toBeNull();
  });

  it('filters with punctuation-insensitive token matching and navigates on Enter', () => {
    render();
    openViaTrigger();
    setQuery('kimi k3');
    const labels = optionLabels();
    expect(labels.some((label) => label.includes('Kimi K3'))).toBe(true);
    pressOnInput('Enter');
    expect(push).toHaveBeenCalledWith('/inference/kimi-k3');
    // Palette closes after selection.
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull();
  });

  it('supports arrow-key selection', () => {
    render();
    openViaTrigger();
    setQuery('chip specs');
    pressOnInput('ArrowDown');
    const active = document.body.querySelector('[role="option"][aria-selected="true"]');
    expect(active).not.toBeNull();
  });

  it('ignores Enter while an IME composition is being confirmed', () => {
    render();
    openViaTrigger();
    setQuery('kimi k3');
    const input = document.body.querySelector(
      '[data-testid="command-palette-input"]',
    ) as HTMLInputElement;
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      );
    });
    expect(push).not.toHaveBeenCalled();
    // The palette stays open, still showing the query.
    expect(document.body.querySelector('[data-testid="command-palette"]')).not.toBeNull();
  });

  it('clears the query when closed via the keyboard shortcut', () => {
    render();
    openViaTrigger();
    setQuery('kimi');
    // Close and reopen via Ctrl+K — the old filter must not persist.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(document.body.querySelector('[data-testid="command-palette"]')).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    const input = document.body.querySelector(
      '[data-testid="command-palette-input"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('shows an empty state for unmatched queries', () => {
    render();
    openViaTrigger();
    setQuery('zzz-no-such-thing');
    expect(optionLabels()).toEqual([]);
    expect(document.body.textContent).toContain('No results');
  });

  it('navigates to the /zh sibling and renders Chinese labels on /zh pages', () => {
    mockPathname = '/zh/glossary';
    render();
    openViaTrigger();
    const input = document.body.querySelector(
      '[data-testid="command-palette-input"]',
    ) as HTMLInputElement;
    expect(input.placeholder).toContain('搜索');
    setQuery('首页');
    pressOnInput('Enter');
    expect(push).toHaveBeenCalledWith('/zh');
  });

  it('treats selecting the current page as a no-op', () => {
    // Re-pushing the same route would only wipe live dashboard filters.
    mockPathname = '/zh';
    render();
    openViaTrigger();
    setQuery('首页');
    pressOnInput('Enter');
    expect(push).not.toHaveBeenCalled();
  });
});
