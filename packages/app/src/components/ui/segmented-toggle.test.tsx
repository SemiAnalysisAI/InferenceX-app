// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SegmentedToggle } from './segmented-toggle';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const options = [
  { value: 'gpu', label: 'GPU only' },
  { value: 'it', label: 'IT (no PUE)', title: 'GPU measured; the rest modeled' },
  { value: 'both', label: 'All', title: 'Three boundaries on one chart', disabled: true },
] as const;
type Value = (typeof options)[number]['value'];

describe('SegmentedToggle select variant', () => {
  it('renders one native select carrying the test id, with each hint joined to its label', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <SegmentedToggle<Value>
        variant="select"
        value="it"
        ariaLabel="Count"
        testId="count"
        size="default"
        onValueChange={() => {}}
        options={[...options]}
      />,
    );
    const select = container.querySelector<HTMLSelectElement>('select[data-testid="count"]');
    expect(select).not.toBeNull();
    expect(select?.getAttribute('aria-label')).toBe('Count');
    expect(select?.className).toContain('h-11');
    expect(select?.className).toContain('md:h-9');
    const rendered = [...(select?.options ?? [])];
    expect(rendered.map((option) => option.value)).toEqual(['gpu', 'it', 'both']);
    expect(rendered.map((option) => option.text)).toEqual([
      'GPU only',
      'IT (no PUE) — GPU measured; the rest modeled',
      'All — Three boundaries on one chart',
    ]);
    expect(rendered.map((option) => option.disabled)).toEqual([false, false, true]);
    expect(rendered.map((option) => option.selected)).toEqual([false, true, false]);
    // No segment buttons alongside the select.
    expect(container.querySelector('button')).toBeNull();
  });

  it('reports the chosen value on change, like a segment click', () => {
    const onValueChange = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <SegmentedToggle<Value>
          variant="select"
          value="gpu"
          ariaLabel="Count"
          testId="count"
          onValueChange={onValueChange}
          options={[...options]}
        />,
      ),
    );
    const select = container.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      select.value = 'it';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith('it');
    act(() => root.unmount());
    container.remove();
  });
});
