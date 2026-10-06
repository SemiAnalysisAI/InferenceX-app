// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EasterEggThemeLazy } from './easter-egg-theme-lazy';
import { useEasterEggTheme } from '@/lib/use-easter-egg-theme';

const loaded = vi.hoisted(() => vi.fn());
vi.mock('./minecraft/minecraft-theme', () => {
  loaded('minecraft');
  return { default: () => <div data-theme="minecraft" /> };
});
vi.mock('./csgo/csgo-theme', () => {
  loaded('csgo');
  return { default: () => <div data-theme="csgo" /> };
});
vi.mock('./gta/gta-theme', () => {
  loaded('gta');
  return { default: () => <div data-theme="gta" /> };
});
vi.mock('./kart/kart-decorations', () => {
  loaded('kart');
  return { default: () => <div data-theme="kart" /> };
});

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
  vi.restoreAllMocks();
});
async function change(theme: string, embed = false) {
  await act(async () => {
    document.documentElement.className = theme;
    if (embed) document.documentElement.dataset.inferencexEmbed = '';
    else delete document.documentElement.dataset.inferencexEmbed;
    await Promise.resolve();
  });
}
function Probe() {
  return <span>{useEasterEggTheme()}</span>;
}

describe('optional theme boundary', () => {
  it('never renders or imports themes on the server or a cold default page', async () => {
    document.documentElement.className = 'kart';
    expect(renderToString(<EasterEggThemeLazy />)).toBe('');
    document.documentElement.className = 'dark';
    act(() => root.render(<EasterEggThemeLazy />));
    await change('light');
    expect(container.innerHTML).toBe('');
    expect(loaded).not.toHaveBeenCalled();
    await change('minecraft', true);
    expect(container.innerHTML).toBe('');
    expect(loaded).not.toHaveBeenCalled();
  });

  it('imports only the selected theme and unmounts it on exit or embed entry', async () => {
    act(() => root.render(<EasterEggThemeLazy />));
    const imports = {
      minecraft: () => import('./minecraft/minecraft-theme'),
      csgo: () => import('./csgo/csgo-theme'),
      gta: () => import('./gta/gta-theme'),
      kart: () => import('./kart/kart-decorations'),
    };
    for (const theme of ['minecraft', 'csgo', 'gta', 'kart'] as const) {
      await change(theme);
      await act(async () => {
        await imports[theme]();
      });
      expect(container.querySelector<HTMLElement>('[data-theme]')?.dataset.theme).toBe(theme);
      expect(loaded).toHaveBeenCalledWith(theme);
      await change(theme, true);
      expect(container.innerHTML).toBe('');
      await change(theme);
      expect(container.querySelector('[data-theme]')).not.toBeNull();
      await change('dark');
      expect(container.innerHTML).toBe('');
    }
  });

  it('shares one observer across consumers and disconnects after the last unmount', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    act(() =>
      root.render(
        <>
          <Probe />
          <Probe />
          <Probe />
        </>,
      ),
    );
    expect(observe).toHaveBeenCalledTimes(1);
    await change('gta');
    expect(container.textContent).toBe('gtagtagta');
    await change('gta', true);
    expect(container.textContent).toBe('');
    act(() => root.render(null));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
