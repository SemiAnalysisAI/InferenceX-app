// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CsgoDecorations } from './csgo-decorations';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  document.documentElement.className = 'dark';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
});

async function setTheme(theme: string) {
  await act(async () => {
    document.documentElement.className = theme;
    await Promise.resolve();
  });
}

describe('CsgoDecorations', () => {
  it('does not mount request-bearing images in the other themes', async () => {
    act(() => root.render(<CsgoDecorations />));
    for (const theme of ['light', 'dark', 'minecraft']) {
      await setTheme(theme);
      expect(container.querySelector('img')).toBeNull();
    }
  });

  it('loads on activation, stays decorative, and unmounts on exit', async () => {
    act(() => root.render(<CsgoDecorations />));
    await setTheme('csgo');
    expect(container.querySelector('[data-testid="csgo-scene"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/decorative/csgo/dust2.webp');
    expect(container.querySelector('source')?.getAttribute('media')).toBe('(max-width: 640px)');
    expect(container.querySelectorAll('button, a, audio, video, iframe, canvas')).toHaveLength(0);
    await setTheme('light');
    expect(container.childElementCount).toBe(0);
    await setTheme('csgo');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('honors a saved CS:GO theme on mount', () => {
    document.documentElement.className = 'csgo';
    act(() => root.render(<CsgoDecorations />));
    expect(container.querySelector('img')).not.toBeNull();
  });
});
