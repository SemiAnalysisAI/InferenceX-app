// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditableTcoBadges } from '@/components/ui/editable-tco-badges';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const ITEMS = [
  { base: 'gb300', label: 'GB300', value: '2.31' },
  { base: 'mi355x', label: 'MI355X', value: '' },
];

function render(onChange = vi.fn(), onCommit = vi.fn()) {
  act(() =>
    root.render(
      <EditableTcoBadges
        label="TCO $/chip/hr:"
        items={ITEMS}
        onChange={onChange}
        onCommit={onCommit}
        inputLabel={(chip) => `${chip} $/chip/hr`}
        testId="badges"
        badgeTestId="badge"
        inputIdPrefix="cost-input"
      />,
    ),
  );
  return { onChange, onCommit };
}

describe('EditableTcoBadges', () => {
  it('renders one labelled number input per chip with the value inside the badge', () => {
    render();
    const inputs = [...container.querySelectorAll<HTMLInputElement>('[data-testid="badge"] input')];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe('2.31');
    expect(inputs[0].type).toBe('number');
    expect(inputs[0].getAttribute('aria-label')).toBe('GB300 $/chip/hr');
    expect(inputs[0].id).toBe('cost-input-gb300');
    expect(container.querySelector('label[for="cost-input-gb300"]')?.textContent).toBe('GB300:');
    // An emptied price stays an empty field, not a zero.
    expect(inputs[1].value).toBe('');
    expect(container.querySelector('[data-testid="badges"]')?.textContent).toContain(
      'TCO $/chip/hr:',
    );
  });

  it('keeps a plain-text twin for PNG export and hides the input from it', () => {
    render();
    const badge = container.querySelector('[data-testid="badge"]');
    expect(badge?.querySelector('input')?.classList.contains('no-export')).toBe(true);
    const twin = badge?.querySelector('.export-only');
    expect(twin?.textContent).toBe('2.31');
    expect(twin?.classList.contains('hidden')).toBe(true);
  });

  it('reports edits by chip and commits on blur', () => {
    const { onChange, onCommit } = render();
    const input = container.querySelector<HTMLInputElement>('[data-testid="cost-input-gb300"]');
    if (!input) throw new Error('missing input');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '9');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('gb300', '9');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith('gb300', '2.31');
  });

  it('sizes each input to the digits it holds', () => {
    render();
    const inputs = [...container.querySelectorAll<HTMLInputElement>('[data-testid="badge"] input')];
    expect(inputs[0].style.width).toBe('5.5ch');
    expect(inputs[1].style.width).toBe('2.5ch');
  });
});
