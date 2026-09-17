// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';

let container: HTMLDivElement;
let root: Root;

const OPTIONS: SegmentedToggleOption<'chart' | 'correlation'>[] = [
  { value: 'chart', label: 'Chart', testId: 'chart-option' },
  { value: 'correlation', ariaLabel: 'Correlation scatter', testId: 'correlation-option' },
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

describe('SegmentedToggle', () => {
  it('passes through tab test IDs, labels, aria-labels, and aria-selected state', () => {
    act(() => {
      root.render(
        React.createElement(SegmentedToggle, {
          value: 'chart',
          options: OPTIONS,
          onValueChange: () => {},
          ariaLabel: 'View mode',
          testId: 'view-toggle',
        }),
      );
    });

    const tablist = container.querySelector('[data-testid="view-toggle"]');
    const chartButton = container.querySelector('[data-testid="chart-option"]');
    const correlationButton = container.querySelector('[data-testid="correlation-option"]');

    expect(tablist?.getAttribute('role')).toBe('tablist');
    expect(tablist?.getAttribute('aria-label')).toBe('View mode');
    expect(chartButton?.textContent).toBe('Chart');
    expect(chartButton?.getAttribute('aria-selected')).toBe('true');
    expect(correlationButton?.getAttribute('aria-label')).toBe('Correlation scatter');
    expect(correlationButton?.getAttribute('aria-selected')).toBe('false');
  });

  it('invokes onValueChange with the selected option value', () => {
    const handleValueChange = vi.fn();

    act(() => {
      root.render(
        React.createElement(SegmentedToggle, {
          value: 'chart',
          options: OPTIONS,
          onValueChange: handleValueChange,
          ariaLabel: 'View mode',
        }),
      );
    });

    const correlationButton = container.querySelector(
      '[data-testid="correlation-option"]',
    ) as HTMLButtonElement;

    act(() => {
      correlationButton.click();
    });

    expect(handleValueChange).toHaveBeenCalledExactlyOnceWith('correlation');
  });

  it('does not activate a disabled option', () => {
    const handleValueChange = vi.fn();
    act(() => {
      root.render(
        React.createElement(SegmentedToggle, {
          value: 'chart',
          options: [OPTIONS[0]!, { ...OPTIONS[1]!, disabled: true }],
          onValueChange: handleValueChange,
          ariaLabel: 'View mode',
        }),
      );
    });

    const disabledButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="correlation-option"]',
    )!;
    expect(disabledButton.disabled).toBe(true);
    act(() => disabledButton.click());
    expect(handleValueChange).not.toHaveBeenCalled();

    const enabledButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="chart-option"]',
    )!;
    act(() => enabledButton.click());
    expect(handleValueChange).toHaveBeenCalledExactlyOnceWith('chart');
  });
});
