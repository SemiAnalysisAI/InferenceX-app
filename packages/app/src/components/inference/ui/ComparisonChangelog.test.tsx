// @test-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';

import { Scenario } from '@/lib/catalog/data-mappings';

import ComparisonChangelog from './ComparisonChangelog';

mock.module('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

type Props = ComponentProps<typeof ComparisonChangelog>;

const BASE: Props = {
  changelogs: [],
  selectedGPUs: ['h200_sglang'],
  selectedPrecisions: ['fp8'],
  modelDbKeys: ['dsr1'],
  selectedScenario: Scenario.EightK_OneK,
  totalDatesQueried: 0,
  selectedDates: [],
  selectedDateRange: { startDate: '', endDate: '' },
  onAddDate: () => {},
  onRemoveDate: () => {},
  onAddAllDates: () => {},
};

let root: Root | null = null;

function render(props: Partial<Props>): HTMLDivElement {
  const container = document.createElement('div');
  root = createRoot(container);
  act(() => root!.render(createElement(ComparisonChangelog, { ...BASE, ...props })));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('ComparisonChangelog', () => {
  it('shows no count and no empty verdict before the data is requested', () => {
    const container = render({ deferred: true });
    expect(container.querySelector('button')?.textContent).toBe('Config Changelog');
    expect(container.textContent).toContain('Loading changelog…');
    expect(container.textContent).not.toContain('No config changelog data');
  });

  it('keeps the empty verdict out of the body while the request is in flight', () => {
    const container = render({ loading: true });
    expect(container.textContent).toContain('Loading changelog…');
    expect(container.textContent).not.toContain('No config changelog data');
  });

  it('shows the empty verdict once loading finishes without matches', () => {
    const container = render({ totalDatesQueried: 3 });
    expect(container.textContent).toContain('No config changelog data');
  });

  it('holds the bounded list height while loading so the chart below does not jump', () => {
    const container = render({ loading: true });
    const list = container.querySelector('[data-testid="comparison-changelog-list"]')!;
    expect(list.classList.contains('h-72')).toBe(true);
    act(() => root!.render(createElement(ComparisonChangelog, { ...BASE, totalDatesQueried: 3 })));
    expect(list.classList.contains('h-72')).toBe(false);
    expect(list.classList.contains('max-h-72')).toBe(true);
  });

  it('reports each toggle so the parent can start the deferred fetch', () => {
    const onExpandedChange = vi.fn();
    const container = render({ defaultExpanded: false, deferred: true, onExpandedChange });
    act(() => container.querySelector('button')!.click());
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    act(() => container.querySelector('button')!.click());
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });
});
