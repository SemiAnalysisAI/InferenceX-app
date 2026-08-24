// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.fn();
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }));

let locale: 'en' | 'zh' = 'en';
vi.mock('@/lib/use-locale', () => ({ useLocale: () => locale }));

import { PromoVideo } from '@/components/about/promo-video';

let container: HTMLDivElement;
let root: Root;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

function video(): HTMLVideoElement {
  const el = container.querySelector('video');
  if (!el) throw new Error('video element not rendered');
  return el;
}

beforeEach(() => {
  locale = 'en';
  track.mockClear();
  // jsdom has no media stack, so HTMLMediaElement.play is undefined by default.
  play = vi.fn<() => Promise<void>>(() => Promise.resolve());
  HTMLMediaElement.prototype.play = play;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PromoVideo', () => {
  it('defers the download until the visitor asks for it', () => {
    renderUi(<PromoVideo />);
    // preload="none" is the whole point: a ~30 MB asset must not land on the
    // critical path of /about for the majority who never press play.
    expect(video().getAttribute('preload')).toBe('none');
    expect(video().getAttribute('poster')).toBe('/promo-poster.webp');
  });

  it('renders an mp4 source and no controls before playback starts', () => {
    renderUi(<PromoVideo />);
    const source = container.querySelector('source');
    expect(source?.getAttribute('type')).toBe('video/mp4');
    expect(source?.getAttribute('src')).toMatch(/^https:\/\//u);
    expect(video().hasAttribute('controls')).toBe(false);
  });

  it('plays, reveals native controls, and hides the overlay on click', () => {
    renderUi(<PromoVideo />);
    const overlay = container.querySelector('button');
    expect(overlay).not.toBeNull();

    act(() => overlay!.click());

    expect(play).toHaveBeenCalledTimes(1);
    expect(video().hasAttribute('controls')).toBe(true);
    expect(container.querySelector('button')).toBeNull();
  });

  it('tracks the play interaction', () => {
    renderUi(<PromoVideo />);
    act(() => container.querySelector('button')!.click());
    expect(track).toHaveBeenCalledWith('about_promo_video_play');
  });

  it('hides the overlay when playback starts without the overlay button', () => {
    // Native controls, keyboard, or the OS media keys can start playback
    // without routing through our overlay; the overlay must still get out of
    // the way rather than covering the running video.
    renderUi(<PromoVideo />);
    act(() => {
      video().dispatchEvent(new Event('play'));
    });
    expect(container.querySelector('button')).toBeNull();
  });

  it('labels the player in English on /about', () => {
    renderUi(<PromoVideo />);
    expect(video().getAttribute('aria-label')).toBe('Play the InferenceX overview video');
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Play the InferenceX overview video',
    );
  });

  it('labels the player in Chinese on /zh/about', () => {
    locale = 'zh';
    renderUi(<PromoVideo />);
    expect(video().getAttribute('aria-label')).toBe('播放 InferenceX 概览视频');
    expect(container.textContent).toContain('您的浏览器无法播放此视频。');
  });
});
