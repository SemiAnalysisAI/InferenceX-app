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
  const input = container.querySelector('input[placeholder="Search..."]') as HTMLInputElement;
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
    const items = container.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(3);
  });

  it('filters options across groups by the search query (option label match)', () => {
    render();
    openMenu();
    setSearchValue('input');
    const items = container.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Input Token Throughput per GPU');
  });

  it('matches on group label as well as option label', () => {
    render();
    openMenu();
    setSearchValue('cost');
    const items = container.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Cost per Million Total Tokens (Hyperscaler)');
  });

  it('shows a "No results" message when nothing matches', () => {
    render();
    openMenu();
    setSearchValue('zzzzz');
    const items = container.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(0);
    expect(container.textContent).toContain('No results');
  });

  it('invokes onValueChange and closes the menu when an option is clicked', () => {
    const handle = vi.fn();
    render({ onValueChange: handle });
    openMenu();
    const items = container.querySelectorAll('[data-slot="select-item"]');
    const target = [...items].find((el) =>
      el.textContent?.includes('Input Token Throughput per GPU'),
    ) as HTMLDivElement;
    act(() => target.click());
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_inputTputPerGpu');
    // Menu closed → no select-item visible
    expect(container.querySelectorAll('[data-slot="select-item"]')).toHaveLength(0);
  });
});
