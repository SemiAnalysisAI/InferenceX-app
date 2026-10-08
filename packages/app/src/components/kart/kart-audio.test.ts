// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  createKartAudio,
  enginePitch,
  KART_SAMPLES,
  kartSampleUrl,
  MUSIC_LOOPS,
} from './kart-audio';
import { EMPTY_CONTROLS, newRace } from './kart-engine';

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

describe('kart game samples', () => {
  it('ships every sample the race plays', () => {
    const pub = path.resolve(import.meta.dirname, '../../../public');
    for (const name of KART_SAMPLES)
      expect(existsSync(path.join(pub, kartSampleUrl(name)))).toBe(true);
  });

  it('raises engine pitch with speed, boost, and throttle', () => {
    expect(enginePitch(0.8, false, true)).toBeGreaterThan(enginePitch(0.2, false, true));
    expect(enginePitch(0.8, true, true)).toBeGreaterThan(enginePitch(0.8, false, true));
    expect(enginePitch(0.8, false, true)).toBeGreaterThan(enginePitch(0.8, false, false));
  });

  it('loads samples and loops the race theme on its measured loop points', async () => {
    const sources: Record<string, unknown>[] = [];
    const node = () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
      frequency: param(),
      gain: param(),
      Q: param(),
      pan: param(),
      playbackRate: param(),
    });
    const Context = function (this: Record<string, unknown>) {
      Object.assign(this, {
        currentTime: 0,
        sampleRate: 100,
        destination: {},
        createGain: node,
        createBiquadFilter: node,
        createOscillator: node,
        createStereoPanner: node,
        createBufferSource: () => {
          const s = node();
          sources.push(s);
          return s;
        },
        createBuffer: () => ({ getChannelData: () => new Float32Array(100) }),
        decodeAudioData: vi.fn(() => Promise.resolve({ duration: 90 })),
        close: vi.fn(() => Promise.resolve()),
        resume: vi.fn(() => Promise.resolve()),
      });
    };
    vi.stubGlobal('AudioContext', Context);
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        fetched.push(url);
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        });
      }),
    );
    const audio = createKartAudio()!;
    await vi.waitFor(() => expect(fetched).toHaveLength(KART_SAMPLES.length));
    await vi.waitFor(() => expect(sources.filter((s) => s.loop).length).toBeGreaterThan(2));
    const race = newRace();
    race.phase = 'racing';
    race.events.push({ type: 'go', kart: race.player.index });
    audio.update(race, 1 / 60, true, { ...EMPTY_CONTROLS, throttle: true });
    const theme = sources.find((s) => s.loopStart === MUSIC_LOOPS['music-race']![0]);
    expect(theme?.loop).toBe(true);
    expect(theme?.loopEnd).toBe(MUSIC_LOOPS['music-race']![1]);
    // Player engine loops plus one positioned engine per rival.
    expect(sources.filter((s) => s.loop).length).toBeGreaterThanOrEqual(
      4 + race.karts.length - 1 + 1,
    );
    audio.dispose();
  });
});
