// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CountUp } from '@/components/motion/count-up';

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
  vi.unstubAllGlobals();
});

describe('CountUp', () => {
  it('renders the final formatted value on first paint (SSR/no-JS safe)', () => {
    act(() => root.render(<CountUp value={1000} />));
    expect(container.textContent).toBe('1,000');
  });

  it('keeps the final value when the visitor prefers reduced motion', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    );
    act(() => root.render(<CountUp value={1000} />));
    expect(container.textContent).toBe('1,000');
  });

  it('formats with the provided locale', () => {
    act(() => root.render(<CountUp value={1000} locale="zh-CN" />));
    expect(container.textContent).toBe('1,000');
  });
});
