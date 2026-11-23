// @test-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { settle } from '@/test/helpers';

import { SearchableSelect, type SearchableSelectGroup } from '@/components/ui/searchable-select';

const route = { pathname: '/infx/inference' };
mock.module('next/navigation', () => ({ usePathname: () => route.pathname }));
const trackMock = (() => vi.fn())();
mock.module('@/lib/analytics/analytics', () => ({ track: trackMock }));

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
  route.pathname = '/infx/inference';
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

/** Opens the menu. Async because floating-ui positions the popover in a promise after it opens. */
async function openMenu() {
  const trigger = container.querySelector('[data-testid="yaxis"]') as HTMLButtonElement;
  act(() => trigger.click());
  await settle();
}

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
  it('uses Chinese defaults for search, clear, empty and placeholder without overriding caller copy', async () => {
    route.pathname = '/zh/infx/inference';
    render({ value: 'unknown' });
    expect(container.textContent).toContain('请选择...');
    await openMenu();
    const input = document.body.querySelector('input')!;
    expect(input.getAttribute('placeholder')).toBe('搜索...');
    expect(input.getAttribute('aria-label')).toBe('搜索选项');
    setSearchValue('no matching option');
    expect(document.body.textContent).toContain('没有结果');
    const clear = document.body.querySelector('button[aria-label="清除搜索"]') as HTMLButtonElement;
    act(() => clear.click());
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    render({ value: 'unknown', placeholder: '选择指标', searchPlaceholder: '搜索指标' });
    expect(container.textContent).toContain('选择指标');
    expect(document.body.querySelector('input')?.getAttribute('placeholder')).toBe('搜索指标');
  });

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

  it('exposes the compact size token and full selected label for long values', () => {
    const longLabel = 'DeepSeek V4 Pro 0813 1.6T FP4 Agentic deployment configuration';
    render({
      size: 'sm',
      value: 'long',
      groups: [{ label: 'Models', options: [{ value: 'long', label: longLabel }] }],
    });
    const trigger = container.querySelector('[data-testid="yaxis"]');
    const label = trigger?.querySelector('span');
    expect((trigger as HTMLElement | null)?.dataset.size).toBe('sm');
    expect(label?.className).toContain('truncate');
    expect(label?.getAttribute('title')).toBe(longLabel);
  });

  it('shows all groups and options when opened', async () => {
    render();
    await openMenu();
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(3);
  });

  it('reports search length and result count, never the typed text', async () => {
    trackMock.mockClear();
    render({ trackPrefix: 'yaxis' });
    await openMenu();
    setSearchValue('input token');
    await openMenu();
    expect(trackMock).toHaveBeenCalledWith('yaxis_searched', { query_length: 11, results: 1 });
    expect(JSON.stringify(trackMock.mock.calls)).not.toContain('input token');
  });

  it('filters options across groups by the search query (option label match)', async () => {
    render();
    await openMenu();
    setSearchValue('input');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Input Token Throughput per GPU');
  });

  it('matches on group label as well as option label', async () => {
    render();
    await openMenu();
    setSearchValue('cost');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Cost per Million Total Tokens (Hyperscaler)');
  });

  it('keeps the collapsed menu and selected label while full-name search selects an exact metric', async () => {
    const handle = vi.fn();
    render({
      value: 'y_measuredAvgPower',
      onValueChange: handle,
      groups: [
        {
          label: 'Measured',
          options: [
            { value: 'y_measuredAvgPower', label: 'Measured Power' },
            { value: 'y_measuredJPerOutputToken', label: 'Measured Energy' },
          ],
        },
      ],
      searchGroups: [
        {
          label: 'Measured',
          options: [
            { value: 'y_measuredAvgPower', label: 'Measured Average Power per Chip' },
            { value: 'y_measuredP75Power', label: 'Measured P75 Fleet Power per Chip' },
            {
              value: 'y_measuredP90Power',
              label: 'Measured P90 Fleet Power per Chip',
              help: 'Time-weighted fleet power percentile.',
            },
          ],
        },
      ],
    });
    const trigger = container.querySelector('[data-testid="yaxis"]')!;
    expect(trigger.textContent).toBe('Measured Power');
    expect(trigger.getAttribute('aria-haspopup')).toBe('grid');
    await openMenu();
    expect(
      [...document.body.querySelectorAll('[data-select-option]')].map((item) => item.textContent),
    ).toEqual(['Measured Power', 'Measured Energy']);
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull();

    setSearchValue('P90 Fleet');
    const matches = document.body.querySelectorAll('[data-select-option]');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.textContent).toBe('Measured P90 Fleet Power per Chip');
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull();
    expect(trigger.textContent).toBe('Measured Power');

    setSearchValue('');
    expect(document.body.querySelectorAll('[data-select-option]')).toHaveLength(2);
    setSearchValue('Measured P75 Fleet Power per Chip');
    const option = document.body.querySelector<HTMLElement>('[data-select-option]')!;
    act(() => option.click());
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_measuredP75Power');
    expect(document.body.querySelectorAll('[data-select-option]')).toHaveLength(0);
  });

  it('keeps family aliases and full-name search without duplicate values or help buttons', async () => {
    const power = {
      value: 'y_measuredP75Power',
      label: 'Measured Power',
      help: 'Time-weighted fleet power percentile.',
    };
    const energy = { value: 'y_measuredJPerOutputToken', label: 'Measured Energy' };
    const handle = vi.fn();
    render({
      value: power.value,
      onValueChange: handle,
      groups: [{ label: 'Measured', options: [power, energy] }],
      searchGroups: [
        {
          label: 'Measured',
          options: [
            power,
            energy,
            { ...power, label: 'Measured P75 Fleet Power per Chip' },
            { ...energy, label: 'Measured Joules per Output Token' },
          ],
        },
      ],
    });
    await openMenu();
    setSearchValue('Measured');
    expect(document.body.querySelectorAll('[data-select-option]')).toHaveLength(2);
    expect(
      document.body.querySelectorAll('[data-testid="option-help-y_measuredP75Power"]'),
    ).toHaveLength(1);
    setSearchValue('Measured Power');
    expect(document.body.querySelectorAll('[data-select-option]')).toHaveLength(1);
    expect(document.body.querySelector('[data-select-option]')?.textContent).toBe('Measured Power');
    setSearchValue('Measured Energy');
    expect(document.body.querySelectorAll('[data-select-option]')).toHaveLength(1);
    expect(document.body.querySelector('[data-select-option]')?.textContent).toBe(
      'Measured Energy',
    );
    setSearchValue('Measured P75 Fleet Power per Chip');
    const option = document.body.querySelector<HTMLElement>('[data-select-option]')!;
    expect(option.textContent).toBe('Measured P75 Fleet Power per Chip');
    act(() => option.click());
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_measuredP75Power');
  });

  it('shows a "No results" message when nothing matches', async () => {
    render();
    await openMenu();
    setSearchValue('zzzzz');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(0);
    expect(document.body.textContent).toContain('No results');
  });

  it('uses localized search controls and empty state labels', async () => {
    render({
      searchPlaceholder: '搜索队列...',
      searchAriaLabel: '搜索 CollectiveX 队列',
      clearSearchLabel: '清除队列搜索',
      noResultsLabel: '无匹配队列',
    });
    await openMenu();
    const input = document.body.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.placeholder).toBe('搜索队列...');
    expect(input.getAttribute('aria-label')).toBe('搜索 CollectiveX 队列');
    setSearchValue('zzzzz');
    expect(document.body.textContent).toContain('无匹配队列');
    expect(document.body.querySelector('button[aria-label="清除队列搜索"]')).not.toBeNull();
  });

  it('filters the canonical 280-cohort publication scale without truncating it', async () => {
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
    await openMenu();
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(280);
    setSearchValue('Routing comparisons');
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(116);
    setSearchValue('Routing cohort 115');
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain('Routing cohort 115');
  });

  it('invokes onValueChange and closes the menu when an option is clicked', async () => {
    const handle = vi.fn();
    render({ onValueChange: handle });
    await openMenu();
    const items = document.body.querySelectorAll('[data-slot="select-item"]');
    const target = [...items].find((el) =>
      el.textContent?.includes('Input Token Throughput per GPU'),
    ) as HTMLDivElement;
    act(() => target.click());
    expect(handle).toHaveBeenCalledExactlyOnceWith('y_inputTputPerGpu');
    expect(document.body.querySelectorAll('[data-slot="select-item"]')).toHaveLength(0);
  });

  it('shows the pick at once and leaves what it re-renders to a transition', async () => {
    const { promise: pending, resolve: release } = Promise.withResolvers<void>();
    function Chart({ metric }: { metric: string }) {
      if (metric === 'y_costh') React.use(pending);
      return React.createElement('p', { 'data-testid': 'chart' }, metric);
    }
    function Page() {
      const [metric, setMetric] = React.useState('y_tpPerGpu');
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(SearchableSelect, {
          groups: GROUPS,
          value: metric,
          onValueChange: setMetric,
          triggerTestId: 'yaxis',
        }),
        React.createElement(
          React.Suspense,
          { fallback: React.createElement('p', { 'data-testid': 'fallback' }) },
          React.createElement(Chart, { metric }),
        ),
      );
    }
    act(() => root.render(React.createElement(Page)));
    await openMenu();
    const option = document.body.querySelector('[data-value="y_costh"]') as HTMLElement;
    await act(() => option.click());
    // A synchronous update would swap the chart for its fallback while the new metric loads.
    expect(container.querySelector('[data-testid="yaxis"]')?.textContent).toContain(
      'Cost per Million Total Tokens (Hyperscaler)',
    );
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="chart"]')?.textContent).toBe('y_tpPerGpu');
    release();
    await settle();
    expect(container.querySelector('[data-testid="chart"]')?.textContent).toBe('y_costh');
  });

  it('moves through options and selects from the keyboard', async () => {
    const handle = vi.fn();
    render({ onValueChange: handle });
    await openMenu();
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
