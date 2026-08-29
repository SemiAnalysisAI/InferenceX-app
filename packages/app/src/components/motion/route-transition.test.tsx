// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RouteTransition } from '@/components/motion/route-transition';
import {
  CompareDetailRouteSkeleton,
  CompareRouteSkeleton,
} from '@/components/motion/route-skeletons';

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

describe('RouteTransition', () => {
  // npm react (used by this test runner) does not ship the ViewTransition
  // API, so this exercises exactly the documented fallback: children render
  // unwrapped and navigation output is unchanged. The Next.js app router
  // uses its vendored React build, where the wrapper is active.
  it('renders children when the React ViewTransition API is unavailable', () => {
    act(() => {
      root.render(
        <RouteTransition>
          <main data-testid="page-content">hello</main>
        </RouteTransition>,
      );
    });

    const content = container.querySelector('[data-testid="page-content"]');
    expect(content).not.toBeNull();
    expect(content?.textContent).toBe('hello');
  });
});

describe('route skeletons', () => {
  it('renders the compare detail fallback with a reserved chart area', () => {
    act(() => {
      root.render(<CompareDetailRouteSkeleton />);
    });
    const skeleton = container.querySelector('[data-testid="route-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
    // The 600px block mirrors the chart card so content replaces the
    // fallback without layout shift.
    expect(container.querySelector(String.raw`[class*="h-\[600px\]"]`)).not.toBeNull();
  });

  it('renders the compare catalog and detail fallbacks', () => {
    act(() => {
      root.render(
        <>
          <CompareRouteSkeleton />
          <CompareDetailRouteSkeleton />
        </>,
      );
    });
    expect(container.querySelectorAll('[data-testid="route-skeleton"]')).toHaveLength(2);
  });
});
