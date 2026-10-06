// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKartAudio } from './kart-audio';
import { newRace } from './kart-engine';

const param = () => ({
  value: 0,
  setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('kart audio cleanup', () => {
  it('cancels final-lap and finish cues before closing the context', () => {
    vi.useFakeTimers();
    let closed = false;
    const node = () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: param(),
      gain: param(),
      Q: param(),
    });
    const oscillator = vi.fn(() => {
      if (closed) throw new Error('AudioContext is closed');
      return node();
    });
    const close = vi.fn(() => {
      closed = true;
      return Promise.resolve();
    });
    const resume = vi.fn(async () => {});
    class Context {
      currentTime = 0;
      sampleRate = 100;
      destination = {};
      createGain = node;
      createBiquadFilter = node;
      createOscillator = oscillator;
      createBufferSource = node;
      createBuffer = () => ({ getChannelData: () => new Float32Array(100) });
      close = close;
      resume = resume;
    }
    vi.stubGlobal('AudioContext', Context);
    const audio = createKartAudio()!;
    const race = newRace();
    race.events.push(
      { type: 'final-lap', kart: race.player.index },
      { type: 'finish', kart: race.player.index },
    );
    audio.update(race, 1 / 60, true);
    expect(vi.getTimerCount()).toBe(5);
    const count = oscillator.mock.calls.length;
    audio.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    audio.update(race, 1 / 60, true);
    audio.resume();
    audio.setMuted(false);
    audio.dispose();
    expect(oscillator).toHaveBeenCalledTimes(count);
    expect(close).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });
});
