// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HaloDecorations } from './halo-decorations';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  document.documentElement.className = 'dark';
  delete document.documentElement.dataset.inferencexEmbed;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
  delete document.documentElement.dataset.inferencexEmbed;
});

async function setTheme(theme: string) {
  await act(async () => {
    document.documentElement.className = theme;
    await Promise.resolve();
  });
}

describe('HaloDecorations', () => {
  it('does not mount request-bearing images in the other themes', async () => {
    act(() => root.render(<HaloDecorations />));
    for (const theme of ['light', 'dark', 'minecraft', 'csgo', 'gta', 'kart', 'doom']) {
      await setTheme(theme);
      expect(container.querySelector('img')).toBeNull();
    }
  });

  it('loads on activation, stays decorative, and unmounts on exit', async () => {
    act(() => root.render(<HaloDecorations />));
    await setTheme('halo');
    expect(container.querySelector('[data-testid="halo-scene"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/decorative/halo/zeta-halo.webp',
    );
    expect(container.querySelector('source')?.getAttribute('media')).toBe('(max-width: 640px)');
    expect(container.querySelectorAll('button, a, audio, video, iframe, canvas')).toHaveLength(0);
    await setTheme('light');
    expect(container.childElementCount).toBe(0);
  });

  it('never mounts artwork on embeds', async () => {
    document.documentElement.dataset.inferencexEmbed = '';
    act(() => root.render(<HaloDecorations />));
    await setTheme('halo');
    expect(container.querySelector('img')).toBeNull();
  });
});
