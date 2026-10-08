// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DoomDecorations } from './doom-decorations';

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

describe('DoomDecorations', () => {
  it('does not mount request-bearing images in the other themes', async () => {
    act(() => root.render(<DoomDecorations />));
    for (const theme of ['light', 'dark', 'minecraft', 'csgo', 'gta', 'kart']) {
      await setTheme(theme);
      expect(container.querySelector('img')).toBeNull();
    }
  });

  it('loads on activation, stays decorative, and unmounts on exit', async () => {
    act(() => root.render(<DoomDecorations />));
    await setTheme('doom');
    expect(container.querySelector('[data-testid="doom-scene"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/decorative/doom/doom-hell.webp',
    );
    expect(container.querySelector('source')?.getAttribute('media')).toBe('(max-width: 640px)');
    expect(container.querySelectorAll('button, a, audio, video, iframe, canvas')).toHaveLength(0);
    await setTheme('light');
    expect(container.childElementCount).toBe(0);
    await setTheme('doom');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('honors a saved Doom theme on mount', () => {
    document.documentElement.className = 'doom';
    act(() => root.render(<DoomDecorations />));
    expect(container.querySelector('img')).not.toBeNull();
  });
});
