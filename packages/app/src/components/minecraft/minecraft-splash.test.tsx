// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameStub = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameStub.value,
}));

import { MinecraftSplash, SPLASHES } from './minecraft-splash';

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => root.render(<MinecraftSplash />));
}

/** MutationObserver callbacks land on the microtask queue. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
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

describe('MinecraftSplash', () => {
  it('announces AgentX outside the minecraft theme (light + dark)', () => {
    render();
    expect(splashText()).toBe('AgentX is here!!');
  });

  it('announces AgentX in Chinese on /zh pages', () => {
    pathnameStub.value = '/zh';
    render();
    expect(splashText()).toBe('AgentX 来了！！');
  });

  it('swaps to a random splash from the list when the minecraft theme is on', async () => {
    document.documentElement.classList.add('minecraft');
    render();
    await flush();
    expect(SPLASHES).toContain(splashText());
  });

  it('falls back to the announcement when the minecraft theme is turned off', async () => {
    document.documentElement.classList.add('minecraft');
    render();
    await flush();

    await act(async () => {
      document.documentElement.classList.remove('minecraft');
      await Promise.resolve();
    });
    expect(splashText()).toBe('AgentX is here!!');
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
