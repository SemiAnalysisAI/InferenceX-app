/**
 * Game audio for Kamaji's Boiler, built on the theme's shared AudioContext.
 *
 * - Music: an original music-box tune on a pentatonic scale (not a film melody), scheduled
 *   with a short look-ahead. Tempo follows Calcifer's heat, brightness follows the batch, and a
 *   KV cache close to full bends the tune into a tense minor colour. The music loop is ducked,
 *   never stopped, while it plays. Honours the theme's music toggle.
 * - Hearth bed: filtered noise whose level and crackle rate follow the heat.
 * - Cues: synthesised clacks, bells and sweeps plus the theme's recorded samples. All honour
 *   the sound toggle.
 *
 * `dispose()` stops every node and timer and restores the music loop.
 */
import type { GhibliAudio, GhibliSound } from './ghibli-audio';
import type { BoilerEvent } from './ghibli-boiler-engine';
import {
  GHIBLI_MUSIC_EVENT,
  GHIBLI_SOUND_EVENT,
  ghibliMusicEnabled,
  ghibliSoundEnabled,
} from './ghibli-prefs';

export interface MusicState {
  heat: number;
  batch: number;
  /** KV used over capacity, 0 to 1+. */
  pressure: number;
  night: number;
  /** 0 calm map, 1 to 4 act, 5 boss. */
  mood: number;
  paused: boolean;
}

// Major pentatonic degrees in semitones, plus a tense set used near OOM and in the finale.
const CALM = [0, 2, 4, 7, 9, 12, 14, 16];
const TENSE = [0, 1, 3, 7, 8, 12, 13, 15];
// An original eight-bar figure, as indexes into the scale (-1 rests).
const FIGURE = [
  0, 2, 4, 5, 4, -1, 2, 1, 0, 2, 3, 2, 1, -1, 0, -1, 2, 4, 6, 5, 4, -1, 3, 2, 1, 2, 4, 2, 1, -1, 0,
  -1,
];
const BASS = [0, -5, -3, -7];
const ROOTS = [62, 62, 60, 64, 57, 59];

const SAMPLE_CUES: Partial<Record<BoilerEvent, [GhibliSound, number, number, number?]>> = {
  // name, volume, rate, gap ms
  konpeito: ['coin', 0.3, 1.6, 200],
  gold: ['coin', 0.32, 0.7, 500],
  tag: ['wave', 0.4, 1.25, 400],
  kodama: ['kodama-rattle', 0.45, 1, 600],
  parakeet: ['parakeet', 0.35, 1.1, 1500],
  shoo: ['wingflap', 0.4, 1.3, 400],
  wave: ['wave', 0.42, 0.9, 1200],
  surge: ['wind', 0.3, 0.8, 3000],
  oom: ['wind', 0.45, 1.3, 1000],
  'boss-eat': ['crackle', 0.4, 0.6, 800],
  helper: ['soot-rustle', 0.25, 1.4, 1500],
  'wave-up': ['chime', 0.35, 1, 600],
};

export class BoilerAudio {
  private readonly context: AudioContext | null;
  private readonly bus: GainNode | null = null;
  private readonly musicBus: GainNode | null = null;
  private readonly musicFilter: BiquadFilterNode | null = null;
  private readonly hearthGain: GainNode | null = null;
  private hearthSource: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | undefined;
  private nextNote = 0;
  private step = 0;
  private popAt = 0;
  private state: MusicState = { heat: 50, batch: 0, pressure: 0, night: 0, mood: 0, paused: false };
  private disposed = false;

  private readonly shared: GhibliAudio | null;

  constructor(shared: GhibliAudio | null) {
    this.shared = shared;
    const context = shared?.audioContext ?? null;
    const output = shared?.output ?? null;
    this.context = context;
    if (!context || !output) return;
    this.bus = context.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(output);
    this.musicFilter = context.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2200;
    this.musicBus = context.createGain();
    this.musicBus.gain.value = 0;
    this.musicFilter.connect(this.musicBus).connect(this.bus);
    this.hearthGain = context.createGain();
    this.hearthGain.gain.value = 0;
    this.hearthGain.connect(this.bus);
    window.addEventListener(GHIBLI_MUSIC_EVENT, this.syncMusic);
    window.addEventListener(GHIBLI_SOUND_EVENT, this.syncSound);
    this.nextNote = context.currentTime + 0.2;
    this.timer = window.setInterval(this.schedule, 120);
    this.syncMusic();
    this.syncSound();
  }

  get available(): boolean {
    return this.context !== null;
  }

  update(state: Partial<MusicState>) {
    this.state = { ...this.state, ...state };
    const context = this.context;
    if (!context || !this.musicFilter || !this.hearthGain) return;
    const now = context.currentTime;
    // Brighter with a bigger batch; muffled at night.
    const cutoff = (900 + Math.min(64, this.state.batch) * 45) * (1 - 0.45 * this.state.night);
    this.musicFilter.frequency.setTargetAtTime(cutoff, now, 0.4);
    const hearth =
      this.state.paused || !ghibliSoundEnabled() || this.state.mood === 0
        ? 0
        : 0.012 + (this.state.heat / 100) * 0.045;
    this.hearthGain.gain.setTargetAtTime(hearth, now, 0.3);
  }

  private readonly syncMusic = () => {
    const context = this.context;
    if (!context || !this.musicBus) return;
    const on = ghibliMusicEnabled();
    this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, context.currentTime, 0.4);
    this.shared?.duck(on ? 0.22 : 1);
  };

  private readonly syncSound = () => {
    const context = this.context;
    if (!context || !this.hearthGain) return;
    if (ghibliSoundEnabled() && !this.hearthSource) this.startHearth();
    if (!ghibliSoundEnabled()) {
      this.stopHearth();
      this.hearthGain.gain.setValueAtTime(0, context.currentTime);
    }
  };

  private noiseBuffer(): AudioBuffer | null {
    const context = this.context;
    if (!context) return null;
    if (!this.noise) {
      const length = Math.floor(context.sampleRate * 2);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let index = 0; index < length; index++) {
        brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[index] = brown * 3.5;
      }
      this.noise = buffer;
    }
    return this.noise;
  }

  private startHearth() {
    const context = this.context;
    const buffer = this.noiseBuffer();
    if (!context || !buffer || !this.hearthGain) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    source.connect(filter).connect(this.hearthGain);
    source.start();
    this.hearthSource = source;
  }

  private stopHearth() {
    try {
      this.hearthSource?.stop();
    } catch {}
    this.hearthSource?.disconnect();
    this.hearthSource = null;
  }

  private readonly schedule = () => {
    const context = this.context;
    if (this.disposed || !context || !this.musicFilter) return;
    const now = context.currentTime;
    if (this.nextNote < now - 0.5) this.nextNote = now + 0.05;
    const { heat, pressure, night, mood, paused } = this.state;
    // Tempo follows the fire: 72 bpm cold, 108 bpm roaring, faster in the finale.
    const bpm = (mood === 0 ? 70 : 72 + heat * 0.36) * (mood === 5 ? 1.12 : 1) * (1 - 0.15 * night);
    const eighth = 30 / bpm;
    while (this.nextNote < now + 0.35) {
      if (!paused && ghibliMusicEnabled()) this.playStep(this.nextNote, eighth, pressure, mood);
      this.nextNote += eighth;
      this.step = (this.step + 1) % FIGURE.length;
    }
    // Random crackle pops from the hearth, more of them when hot.
    if (!paused && mood > 0 && ghibliSoundEnabled() && now > this.popAt) {
      this.popAt = now + 0.15 + Math.random() * (1.4 - heat / 90);
      this.pop(now + 0.02, 0.03 + (heat / 100) * 0.05);
    }
  };

  private playStep(at: number, eighth: number, pressure: number, mood: number) {
    const scale = pressure > 0.86 || mood === 5 ? TENSE : CALM;
    const root = ROOTS[Math.min(ROOTS.length - 1, mood)] - (this.state.night > 0.5 ? 12 : 0);
    const degree = FIGURE[this.step];
    if (degree >= 0) this.bell(this.midi(root + 12 + scale[degree]), at, 0.11, 1.4);
    if (this.step % 8 === 0) {
      const bass = BASS[(this.step / 8) % BASS.length];
      this.pad(this.midi(root - 12 + bass), at, eighth * 7.5, 0.06);
    }
    // A second voice joins when the batch is big, an audible sign of a busy hearth.
    if (this.state.batch >= 24 && this.step % 4 === 2 && degree >= 0)
      this.bell(this.midi(root + 24 + scale[(degree + 2) % scale.length]), at, 0.04, 0.8);
  }

  private midi(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
  }

  private bell(
    frequency: number,
    at: number,
    volume: number,
    decay: number,
    destination?: AudioNode,
  ) {
    const context = this.context;
    const out = destination ?? this.musicFilter;
    if (!context || !out) return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    gain.connect(out);
    const live = { count: 3 };
    for (const [ratio, level] of [
      [1, 1],
      [2.01, 0.28],
      [3.98, 0.08],
    ] as const) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      const partial = context.createGain();
      partial.gain.value = level;
      osc.connect(partial).connect(gain);
      osc.start(at);
      osc.stop(at + decay + 0.05);
      osc.addEventListener('ended', () => {
        osc.disconnect();
        partial.disconnect();
        live.count -= 1;
        if (live.count === 0) gain.disconnect();
      });
    }
  }

  private pad(frequency: number, at: number, length: number, volume: number) {
    const context = this.context;
    if (!context || !this.musicFilter) return;
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.25);
    gain.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(gain).connect(this.musicFilter);
    osc.start(at);
    osc.stop(at + length + 0.05);
    osc.addEventListener('ended', () => {
      osc.disconnect();
      gain.disconnect();
    });
  }

  private pop(at: number, volume: number) {
    const context = this.context;
    const buffer = this.noiseBuffer();
    if (!context || !buffer || !this.bus) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 2400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    source.connect(filter).connect(gain).connect(this.bus);
    source.start(at, Math.random() * 1.5, 0.08);
    source.addEventListener('ended', () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    });
  }

  private sweep(from: number, to: number, length: number, volume: number, type: OscillatorType) {
    const context = this.context;
    if (!context || !this.bus) return;
    const at = context.currentTime + 0.01;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(this.bus);
    osc.start(at);
    osc.stop(at + length + 0.05);
    osc.addEventListener('ended', () => {
      osc.disconnect();
      gain.disconnect();
    });
  }

  private clack(pitch: number, volume: number) {
    const context = this.context;
    const buffer = this.noiseBuffer();
    if (!context || !buffer || !this.bus) return;
    const at = context.currentTime + 0.005;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = pitch;
    filter.Q.value = 3;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    source.connect(filter).connect(gain).connect(this.bus);
    source.start(at, Math.random(), 0.12);
    source.addEventListener('ended', () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    });
  }

  /** A game event. `detail` carries a 0-1 parameter (door index, batch share, lever level). */
  cue(event: BoilerEvent | 'menu' | 'medal' | 'buy' | 'locked', detail = 0) {
    const context = this.context;
    if (this.disposed || !context || !ghibliSoundEnabled()) return;
    const sample = SAMPLE_CUES[event as BoilerEvent];
    if (sample)
      this.shared?.play(sample[0], { volume: sample[1], rate: sample[2], gap: sample[3] });
    const at = context.currentTime + 0.01;
    const bus = this.bus ?? undefined;
    const bell = (note: number, offset: number, volume: number, decay: number) =>
      this.bell(this.midi(note), at + offset, volume, decay, bus);
    const cues: Partial<Record<string, () => void>> = {
      // Each door clacks at its own pitch, like Howl's dial clicking into place.
      door: () => this.clack(500 + detail * 900, 0.5),
      lever: () => this.clack(1400 + detail * 1600, 0.3),
      // Pitch rises as the batch fills.
      admit: () => bell(74 + Math.round(detail * 12), 0, 0.05, 0.25),
      complete: () => bell(86 + Math.round(detail * 5), 0, 0.06, 0.6),
      oom: () => this.sweep(240, 45, 1.1, 0.25, 'sawtooth'),
      out: () => this.sweep(520, 90, 0.9, 0.16, 'triangle'),
      stolen: () => this.sweep(1200, 600, 0.3, 0.1, 'square'),
      drop: () => this.sweep(300, 200, 0.18, 0.06, 'triangle'),
      'warn-kv': () => {
        bell(81, 0, 0.08, 0.3);
        bell(80, 0.18, 0.08, 0.3);
      },
      'tag-empty': () => this.clack(260, 0.35),
      locked: () => this.clack(260, 0.35),
      'boss-phase': () => {
        bell(38, 0, 0.3, 2.4);
        bell(45, 0.05, 0.16, 2);
      },
      'boss-hit': () => bell(79, 0, 0.1, 0.8),
      night: () => this.sweep(330, 220, 1.6, 0.05, 'sine'),
      day: () => bell(76, 0, 0.08, 1.2),
      end: () => this.fanfare(at, bus),
      medal: () => this.fanfare(at, bus),
      buy: () => this.shared?.play('coin', { volume: 0.4, rate: 1.2, gap: 100 }),
      menu: () => this.clack(900, 0.2),
    };
    cues[event]?.();
  }

  private fanfare(at: number, bus: AudioNode | undefined) {
    [0, 4, 7, 12].forEach((step, index) =>
      this.bell(this.midi(72 + step), at + index * 0.14, 0.1, 1.4, bus),
    );
  }

  dispose() {
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener(GHIBLI_MUSIC_EVENT, this.syncMusic);
    window.removeEventListener(GHIBLI_SOUND_EVENT, this.syncSound);
    this.stopHearth();
    const context = this.context;
    if (context && this.bus) {
      this.bus.gain.setTargetAtTime(0, context.currentTime, 0.05);
      // Notes already scheduled end on their own; cutting the bus silences them at once.
      this.bus.disconnect();
      this.musicFilter?.disconnect();
      this.musicBus?.disconnect();
      this.hearthGain?.disconnect();
    }
    this.shared?.duck(1);
  }
}
