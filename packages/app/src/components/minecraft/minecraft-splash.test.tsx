// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stubMatchMedia } from '@/test/match-media-stub';
import { MinecraftSplash } from './minecraft-splash';

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(<MinecraftSplash />));
}

beforeEach(() => {
  stubMatchMedia({ '(min-width: 1024px)': true });
  document.documentElement.className = '';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
  window.history.replaceState({}, '', '/');
});

describe('standard-page announcement', () => {
  it.each(['/', '/zh'])('does not render a splash announcement on %s', (pathname) => {
    window.history.replaceState({}, '', pathname);
    render();
    expect(container.childElementCount).toBe(0);
  });
});
