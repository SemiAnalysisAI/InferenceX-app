// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';

let container: HTMLDivElement;
let root: Root;

const GROUPS: SearchableSelectGroup[] = [
  {
    label: 'Throughput',
    options: [
      { value: 'y_tpPerGpu', label: 'Token Throughput per GPU' },
      { value: 'y_inputTputPerGpu', label: 'Input Token Throughput per GPU' },
    ],
  },
  {
    label: 'Cost per Million Total Tokens',
    options: [{ value: 'y_costh', label: 'Cost per Million Total Tokens (Hyperscaler)' }],
  },
];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  act(() => {
    root.render(
      React.createElement(SearchableSelect, {
        groups: GROUPS,
        value: 'y_tpPerGpu',
        onValueChange: () => {},
        triggerTestId: 'yaxis',
        ...props,
      }),
    );
  });
}

function openMenu() {
  const trigger = container.querySelector('[data-testid="yaxis"]') as HTMLButtonElement;
  act(() => trigger.click());
}

// React 18 controlled inputs ignore direct `.value` assignment because the
// internal value tracker thinks nothing changed. Use the native HTMLInputElement
// setter so React picks up the change and fires onChange in jsdom.
function setSearchValue(value: string) {
  const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('SearchableSelect', () => {
  it('renders the selected option label on the trigger', () => {
    render();
    const trigger = container.querySelector('[data-testid="yaxis"]');
    expect(trigger?.textContent).toContain('Token Throughput per GPU');
  });

  it('falls back to the placeholder when nothing is selected', () => {
    render({ value: 'unknown', placeholder: 'Pick one' });
    const trigger = container.querySelector('[data-testid="yaxis"]');
    expect(trigger?.textContent).toContain('Pick one');
  });

  it('shows all groups and options when opened', () => {
    render();
    openMenu();
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(3);
  });

  it('filters options across groups by the search query (option label match)', () => {
    render();
    openMenu();
    setSearchValue('input');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Input Token Throughput per GPU');
  });

  it('matches on group label as well as option label', () => {
    render();
    openMenu();
    setSearchValue('cost');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Cost per Million Total Tokens (Hyperscaler)');
  });

  it('shows a "No results" message when nothing matches', () => {
    render();
    openMenu();
    setSearchValue('zzzzz');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(0);
    expect(document.body.textContent).toContain('No results');
  });

  it('uses localized search controls and empty state labels', () => {
    render({
      searchPlaceholder: '搜索队列...',
      searchAriaLabel: '搜索 CollectiveX 队列',
      clearSearchLabel: '清除队列搜索',
      noResultsLabel: '无匹配队列',
    });
    openMenu();
    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe('搜索队列...');
    expect(input.getAttribute('aria-label')).toBe('搜索 CollectiveX 队列');
    setSearchValue('zzzzz');
    expect(document.body.textContent).toContain('无匹配队列');
    expect(document.body.querySelector('button[aria-label="清除队列搜索"]')).not.toBeNull();
  });

  it('filters the canonical 280-cohort publication scale without truncating it', () => {
    const groups = [
      ['Library', 76],
      ['Platform', 76],
      ['Reference system', 12],
      ['Routing', 116],
    ].map(([label, size]) => ({
      label: `${label} comparisons`,
      options: Array.from({ length: Number(size) }, (_, index) => ({
        value: `${label}-cohort-${index}`,
        label: `${label} cohort ${index}`,
      })),
    }));
    render({ groups, value: 'Library-cohort-0' });
    openMenu();
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(280);
    setSearchValue('Routing comparisons');
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(116);
    setSearchValue('Routing cohort 115');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Routing cohort 115');
  });

  it('invokes onValueChange and closes the menu when an option is clicked', () => {
    const handle = vi.fn();
    render({ onValueChange: handle });
    openMenu();
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    const target = [...items].find((el) =>
      el.textContent?.includes('Input Token Throughput per GPU'),
    ) as HTMLDivElement;
    act(() => target.click());
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_inputTputPerGpu');
    // Menu closed → no select-item visible
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(0);
  });

  it('moves through options and selects from the keyboard', () => {
    const handle = vi.fn();
    render({ onValueChange: handle });
    openMenu();
    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    const options = document.body.querySelectorAll<HTMLElement>('[data-slot="select-item"]');
    expect([...options].every((item) => item.tabIndex === -1)).toBe(true);
    act(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(document.activeElement).toBe(options[0]);
    act(() =>
      options[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(document.activeElement).toBe(options[1]);
    act(() =>
      options[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_inputTputPerGpu');
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(0);
  });
});
