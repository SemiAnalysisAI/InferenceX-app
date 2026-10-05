// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KartDecorations } from './kart-decorations';

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
  delete document.documentElement.dataset.inferencexEmbed;
});
async function change(theme: string, embed = false) {
  await act(async () => {
    document.documentElement.className = theme;
    if (embed) document.documentElement.dataset.inferencexEmbed = '';
    else delete document.documentElement.dataset.inferencexEmbed;
    await Promise.resolve();
  });
}
describe('Mario Kart decorations', () => {
  it('does not request images or mount game controls in other themes', async () => {
    act(() => root.render(<KartDecorations />));
    for (const theme of ['light', 'dark', 'minecraft', 'csgo', 'gta']) {
      await change(theme);
      expect(container.childElementCount).toBe(0);
    }
  });
  it('mounts responsive noninteractive imagery only while active', async () => {
    act(() => root.render(<KartDecorations />));
    await change('kart');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/decorative/kart/circuit.webp',
    );
    expect(container.querySelector('source')?.getAttribute('srcset')).toBe(
      '/decorative/kart/circuit-mobile.webp',
    );
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('button, a, canvas, audio')).toHaveLength(0);
    await change('dark');
    expect(container.childElementCount).toBe(0);
  });
  it('suppresses images in embeds and responds to embed changes', async () => {
    act(() => root.render(<KartDecorations />));
    await change('kart', true);
    expect(container.childElementCount).toBe(0);
    await change('kart');
    expect(container.querySelector('img')).not.toBeNull();
    await change('kart', true);
    expect(container.childElementCount).toBe(0);
  });
});
