// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getAllChipPages } from '@/lib/chip-pages';

import { SpecTable } from './chip-page-sections';

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

describe('chip specification table', () => {
  it('keeps values aligned in a scrollable table and exposes the mobile hint', () => {
    act(() => {
      root.render(<SpecTable entry={getAllChipPages()[0]} locale="en" />);
    });

    const table = container.querySelector('table');
    expect(table?.className).toContain('min-w-[36rem]');
    expect(container.querySelector('td')?.className).toContain('text-right');
    expect(container.textContent).toContain('Swipe horizontally');
  });

  it('uses the Chinese mobile hint on the Chinese detail template', () => {
    act(() => {
      root.render(<SpecTable entry={getAllChipPages()[0]} locale="zh" />);
    });

    expect(container.textContent).toContain('左右滑动可查看全部规格参数');
  });
});
