// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GtaDecorations } from './gta-decorations';

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

describe('GtaDecorations', () => {
  it('renders nothing in the other themes', async () => {
    act(() => root.render(<GtaDecorations />));
    for (const theme of ['light', 'dark', 'minecraft', 'csgo']) {
      await setTheme(theme);
      expect(container.childElementCount).toBe(0);
    }
  });

  it('mounts on activation, stays decorative and request-free, and unmounts on exit', async () => {
    act(() => root.render(<GtaDecorations />));
    await setTheme('gta');
    const scene = container.querySelector('[data-testid="gta-scene"]');
    expect(scene?.getAttribute('aria-hidden')).toBe('true');
    expect(scene?.querySelector('svg.gta-scene-skyline')).not.toBeNull();
    expect(
      container.querySelectorAll('img, image, button, a, audio, video, iframe, canvas'),
    ).toHaveLength(0);
    await setTheme('light');
    expect(container.childElementCount).toBe(0);
    await setTheme('gta');
    expect(container.querySelectorAll('[data-testid="gta-scene"]')).toHaveLength(1);
  });

  it('honors a saved GTA theme on mount', () => {
    document.documentElement.className = 'gta';
    act(() => root.render(<GtaDecorations />));
    expect(container.querySelector('[data-testid="gta-scene"]')).not.toBeNull();
  });
});
