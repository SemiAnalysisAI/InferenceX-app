// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameStub = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameStub.value,
}));

import { MinecraftSplash } from './minecraft-splash';

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(<MinecraftSplash />));
}

function splashText(): string | null {
  return container.querySelector('.splash-text')?.textContent ?? null;
}

beforeEach(() => {
  pathnameStub.value = '/';
  document.documentElement.className = '';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
});

describe('standard-page announcement', () => {
  it('announces AgentX on standard pages', () => {
    render();
    expect(splashText()).toBe('AgentX is here!!');
  });

  it('announces AgentX in Chinese on /zh pages', () => {
    pathnameStub.value = '/zh';
    render();
    expect(splashText()).toBe('AgentX 来了！！');
  });

  it('renders the same markup on the server as on the first client render', () => {
    // The random pick is deferred to an effect precisely so SSR and hydration
    // agree — a splash chosen during render would mismatch on every load.
    render();
    const first = splashText();
    act(() => root.render(<MinecraftSplash />));
    expect(splashText()).toBe(first);
  });
});
