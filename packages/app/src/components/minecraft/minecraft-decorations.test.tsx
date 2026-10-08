// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MinecraftDecorations } from './minecraft-decorations';

interface AudioStub {
  src: string;
  volume: number;
  play: () => Promise<void>;
  pause: () => void;
}

let audioInstances: AudioStub[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  audioInstances = [];
  document.documentElement.className = 'minecraft';
  localStorage.removeItem('minecraft-sound');

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  vi.stubGlobal(
    'Audio',
    class implements AudioStub {
      src: string;
      volume = 1;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();

      constructor(src: string) {
        this.src = src;
        audioInstances.push(this);
      }
    },
  );

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.className = '';
  vi.unstubAllGlobals();
});

describe('MinecraftDecorations', () => {
  it('plays the dragon growl at quarter volume', async () => {
    await act(async () => {
      root.render(<MinecraftDecorations />);
      await Promise.resolve();
    });

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0]).toMatchObject({
      src: '/decorative/minecraft/ender-dragon.mp3',
      volume: 0.25,
    });
  });
});
