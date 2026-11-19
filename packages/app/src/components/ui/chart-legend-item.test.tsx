// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChartLegendItem from './chart-legend-item';

vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<React.ComponentProps<typeof ChartLegendItem>>) {
  act(() =>
    root.render(
      <ul>
        <ChartLegendItem
          name="h100"
          label="H100"
          color="#000"
          isActive={false}
          onClick={() => undefined}
          {...props}
        />
      </ul>,
    ),
  );
  return container.querySelector('input')!;
}

describe('ChartLegendItem blocked state', () => {
  it('exposes the block reason on the focusable checkbox', () => {
    const input = render({ blockedReason: 'Pick one engine first' });
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(input.className).toContain('sr-only');
    expect(input.className).not.toContain('hidden');
    const description = document.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(description?.textContent).toBe('Pick one engine first');
  });

  it('has no disabled description when not blocked', () => {
    const input = render({});
    expect(input.hasAttribute('aria-disabled')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('ignores the block reason for an active item', () => {
    const input = render({ isActive: true, blockedReason: 'Pick one engine first' });
    expect(input.hasAttribute('aria-disabled')).toBe(false);
  });
});
