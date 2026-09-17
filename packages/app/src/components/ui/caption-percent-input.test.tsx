// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptionPercentInput } from '@/components/ui/caption-percent-input';

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

function render(value: string, onChange = vi.fn(), onBlur = vi.fn()) {
  act(() =>
    root.render(
      <CaptionPercentInput
        id="pct"
        testId="pct-input"
        ariaLabel="Utilization (%)"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />,
    ),
  );
  return container.querySelector<HTMLInputElement>('[data-testid="pct-input"]')!;
}

describe('CaptionPercentInput', () => {
  it('renders a bounded number input named for the assumption', () => {
    const input = render('60');
    expect(input.id).toBe('pct');
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.getAttribute('aria-label')).toBe('Utilization (%)');
    expect(input.value).toBe('60');
  });

  it('keeps the % sign out of textContent so the caption still reads as plain text', () => {
    render('60');
    expect(container.textContent).toBe('');
  });

  it('forwards edits and blur to the owner', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const input = render('60', onChange, onBlur);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '45');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('45');
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('sizes the box to the digits typed', () => {
    expect(render('6').style.width).toBe('1.5ch');
    expect(render('100').style.width).toBe('3.5ch');
  });
});
