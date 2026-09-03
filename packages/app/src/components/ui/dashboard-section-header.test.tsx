// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DashboardSectionHeader } from './dashboard-section-header';

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

describe('DashboardSectionHeader', () => {
  it('keeps the requested heading semantics, description, and action content', () => {
    act(() => {
      root.render(
        <DashboardSectionHeader
          title="Inference Performance"
          description="Benchmark results"
          headingAs="h3"
          actions={<button type="button">Share</button>}
        />,
      );
    });

    expect(container.querySelector('h3')?.textContent).toBe('Inference Performance');
    expect(container.querySelector('p')?.textContent).toBe('Benchmark results');
    expect(container.querySelector('button')?.textContent).toBe('Share');
  });
});
