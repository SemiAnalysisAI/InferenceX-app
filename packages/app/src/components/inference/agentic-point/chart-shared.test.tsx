// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CHART_SIZES, ChartSkeleton } from './chart-shared';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function skeleton(): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-testid="agentic-chart-skeleton"]');
  if (!el) throw new Error('skeleton not rendered');
  return el;
}

describe('ChartSkeleton', () => {
  it('takes the inline chart aspect ratio instead of a fixed pixel height', () => {
    act(() => root.render(<ChartSkeleton />));

    const { width, height } = CHART_SIZES.inline;
    expect(skeleton().style.aspectRatio).toBe(`${width} / ${height}`);
    expect(skeleton().style.height).toBe('');
    expect(skeleton().className).toContain('w-full');
    expect(skeleton().className).not.toMatch(/\bh-\[/);
  });

  it('uses the expanded chart aspect ratio for the expanded size', () => {
    act(() => root.render(<ChartSkeleton size="expanded" />));

    const { width, height } = CHART_SIZES.expanded;
    expect(skeleton().style.aspectRatio).toBe(`${width} / ${height}`);
  });
});
