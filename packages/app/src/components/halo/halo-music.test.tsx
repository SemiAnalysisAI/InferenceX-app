// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HALO_MUSIC_EVENT, HALO_MUSIC_KEY, HALO_MUSIC_SRC, HaloMusic } from './halo-music';

let container: HTMLDivElement;
let root: Root;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('HaloMusic', () => {
  it('loops the local theme by default and stops on unmount', () => {
    act(() => root.render(<HaloMusic />));
    expect(play).toHaveBeenCalledTimes(1);
    const audio = play.mock.contexts[0] as HTMLAudioElement;
    expect(audio.src).toContain(HALO_MUSIC_SRC);
    expect(audio.loop).toBe(true);
    act(() => root.unmount());
    expect(pause).toHaveBeenCalled();
    root = createRoot(container);
  });

  it('stays silent when muted and responds to the toggle event', () => {
    localStorage.setItem(HALO_MUSIC_KEY, 'false');
    act(() => root.render(<HaloMusic />));
    expect(play).not.toHaveBeenCalled();
    localStorage.setItem(HALO_MUSIC_KEY, 'true');
    act(() => {
      window.dispatchEvent(new CustomEvent(HALO_MUSIC_EVENT));
    });
    expect(play).toHaveBeenCalledTimes(1);
    localStorage.setItem(HALO_MUSIC_KEY, 'false');
    act(() => {
      window.dispatchEvent(new CustomEvent(HALO_MUSIC_EVENT));
    });
    expect(pause).toHaveBeenCalled();
  });

  it('retries after a user gesture when autoplay is blocked', async () => {
    play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    await act(async () => {
      root.render(<HaloMusic />);
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(2);
  });
});
