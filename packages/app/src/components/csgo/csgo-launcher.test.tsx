// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CsgoThemeBanner, CsgoDecorations } from './csgo-decorations';

const state = vi.hoisted(() => ({ pathname: '/', locale: 'en' }));
const track = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => state.locale }));
vi.mock('@/lib/analytics', () => ({ track }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  state.pathname = '/';
  state.locale = 'en';
  document.documentElement.className = 'dark';
  delete document.documentElement.dataset.inferencexEmbed;
  track.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete document.documentElement.dataset.inferencexEmbed;
});
async function theme(value: string, embed = false) {
  await act(async () => {
    document.documentElement.className = value;
    if (embed) document.documentElement.dataset.inferencexEmbed = '';
    else delete document.documentElement.dataset.inferencexEmbed;
    await Promise.resolve();
  });
}
describe('CS:GO landing launcher', () => {
  it('emits no server markup even with a saved optional theme', () => {
    document.documentElement.className = 'csgo';
    expect(renderToString(<CsgoThemeBanner />)).toBe('');
    expect(renderToString(<CsgoDecorations />)).toBe('');
  });
  it('is absent from every other theme and embeds', async () => {
    act(() =>
      root.render(
        <>
          <CsgoThemeBanner />
          <CsgoDecorations />
        </>,
      ),
    );
    for (const other of ['light', 'dark', 'minecraft', 'gta', 'kart', 'system']) {
      await theme(other);
      expect(container.innerHTML).toBe('');
    }
    await theme('csgo', true);
    expect(container.innerHTML).toBe('');
  });
  it('uses a native, explicit new-tab link with no game element or preload', async () => {
    act(() => root.render(<CsgoThemeBanner />));
    await theme('csgo');
    const link = container.querySelector<HTMLAnchorElement>('[data-testid="csgo-game-launch"]')!;
    expect(link.textContent).toBe('Play CS:GO');
    expect(link.href).toBe(
      'https://www.perplexity.ai/computer/a/b606a329-d010-4e4a-a228-638a718d71a1',
    );
    expect(link.target).toBe('_blank');
    expect(link.rel.split(' ')).toEqual(
      expect.arrayContaining(['noopener', 'noreferrer', 'nofollow']),
    );
    expect(container.querySelectorAll('iframe, canvas, audio, video, link, script')).toHaveLength(
      0,
    );
    expect(container.textContent).toContain('Development preview');
    expect(track).not.toHaveBeenCalled();
    link.addEventListener('click', (event) => event.preventDefault());
    act(() => link.click());
    expect(track).toHaveBeenCalledWith('csgo_game_preview_opened', {
      surface: 'landing',
      locale: 'en',
    });
    await theme('dark');
    expect(container.innerHTML).toBe('');
  });
  it('localizes the Chinese landing and leaves other pages unchanged', async () => {
    state.pathname = '/zh';
    state.locale = 'zh';
    act(() => root.render(<CsgoThemeBanner />));
    await theme('csgo');
    expect(container.textContent).toContain('试玩 CS:GO');
    expect(container.textContent).toContain('需要预览访问权限');
    state.pathname = '/zh/about';
    act(() => root.render(<CsgoThemeBanner />));
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('DUST II');
  });
});
