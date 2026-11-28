/**
 * Web Audio engine for the GTA theme outside the 3D game. Interface sounds are synthesized;
 * the stingers, the quoted lines and the theme station are short recordings under
 * `/decorative/gta/audio/`, fetched from this origin only while the theme is mounted and only
 * after a user gesture. There are no media elements. `disposeGtaAudio` tears the whole graph
 * down and drops every decoded recording when the theme unmounts.
 *
 * Two buses: interface sounds, and a radio bus that ducks under stingers instead of stopping.
 * The radio has the recorded theme station and a small step sequencer with three original ones.
 */
import { getGtaState, type GtaStation } from './gta-store';

export type GtaSfx =
  | 'nav'
  | 'select'
  | 'back'
  | 'toggle'
  | 'error'
  | 'cash'
  | 'star'
  | 'clear'
  | 'cheat'
  | 'passed'
  | 'busted'
  | 'phone'
  | 'tune'
  | 'chopper'
  | 'blip'
  | 'switch';

/** Recordings in `/decorative/gta/audio/`; provenance is in that folder's README. */
export type GtaClip =
  | 'here-we-go-again'
  | 'follow-the-train'
  | 'wrong-house'
  | 'smokes-order-1'
  | 'smokes-order-2'
  | 'mission-passed-sa'
  | 'mission-passed-v'
  | 'wasted'
  | 'phone-notify';

const CLIP_BASE = '/decorative/gta/audio/';
/** Recordings that stand in for a synthesized cue once they are decoded. */
const SAMPLED: Partial<Record<GtaSfx, GtaClip>> = {
  passed: 'mission-passed-sa',
  busted: 'wasted',
  phone: 'phone-notify',
};
/** Cues that may wait a moment for their recording instead of playing the synthesized one. */
const STINGERS = new Set<GtaSfx>(['passed', 'busted']);
const PRELOAD: GtaClip[] = ['mission-passed-sa', 'wasted', 'phone-notify', 'here-we-go-again'];
/** A recording that arrives later than this after it was asked for is not played. */
const CLIP_PATIENCE_MS = 1800;
/** The two recorded stations, with a gain that brings them to about the same level. */
const RECORDED = {
  theme: { file: 'theme-san-andreas', gain: 1.1 },
  welcome: { file: 'theme-los-santos', gain: 1.8 },
} as const;
type RecordedStation = keyof typeof RECORDED;
const isRecorded = (station: GtaStation): station is RecordedStation =>
  Object.hasOwn(RECORDED, station);

const SFX_VOLUME = 0.32;
const MUSIC_VOLUME = 0.11;
const DUCKED = 0.3;
const BAR_KEY = 'gta-radio-bar';

let context: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let noise: AudioBuffer | null = null;
let disposed = false;
let unlocked = false;
const lastStart = new Map<GtaSfx, number>();
const clips = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

/** True once the visitor has interacted with the page; nothing sounds or downloads before. */
function gestured(): boolean {
  return (
    unlocked ||
    (typeof navigator !== 'undefined' &&
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
        ?.hasBeenActive === true)
  );
}

function ensureContext(): AudioContext | null {
  if (disposed) return null;
  if (context) return context;
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 8;
  limiter.connect(context.destination);
  sfxBus = context.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(limiter);
  musicFilter = context.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 9000;
  musicBus = context.createGain();
  musicBus.gain.value = MUSIC_VOLUME;
  musicBus.connect(musicFilter);
  musicFilter.connect(limiter);
  const length = Math.floor(context.sampleRate * 1.2);
  noise = context.createBuffer(1, length, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
  return context;
}

/** Resumes the context after a user gesture. Returns it when sound may be made. */
function ready(): AudioContext | null {
  const audio = ensureContext();
  if (!audio) return null;
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  return audio;
}

interface Tone {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  length: number;
  gain?: number;
  attack?: number;
  cutoff?: number;
}

function tone(audio: AudioContext, bus: AudioNode, spec: Tone) {
  const start = audio.currentTime + (spec.at ?? 0);
  const end = start + spec.length;
  const oscillator = audio.createOscillator();
  oscillator.type = spec.type ?? 'sine';
  oscillator.frequency.setValueAtTime(spec.from, start);
  if (spec.to) oscillator.frequency.exponentialRampToValueAtTime(spec.to, end);
  const gain = audio.createGain();
  const peak = spec.gain ?? 0.5;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + (spec.attack ?? 0.005));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  let tail: AudioNode = gain;
  if (spec.cutoff) {
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.cutoff;
    gain.connect(filter);
    tail = filter;
  }
  oscillator.connect(gain);
  tail.connect(bus);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

interface Hiss {
  at?: number;
  length: number;
  gain?: number;
  type?: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
}

function hiss(audio: AudioContext, bus: AudioNode, spec: Hiss) {
  if (!noise) return;
  const start = audio.currentTime + (spec.at ?? 0);
  const end = start + spec.length;
  const source = audio.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = spec.type ?? 'bandpass';
  filter.Q.value = spec.q ?? 1;
  filter.frequency.setValueAtTime(spec.from, start);
  if (spec.to) filter.frequency.exponentialRampToValueAtTime(spec.to, end);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(spec.gain ?? 0.3, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(bus);
  source.start(start, Math.random() * 0.5);
  source.stop(end + 0.02);
}

/** Lowers the radio under a stinger and brings it back; the radio never stops for a sound. */
function duck(seconds: number) {
  if (!context || !musicBus) return;
  const now = context.currentTime;
  const { gain } = musicBus;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(MUSIC_VOLUME * DUCKED, now + 0.08);
  gain.setValueAtTime(MUSIC_VOLUME * DUCKED, now + seconds);
  gain.linearRampToValueAtTime(MUSIC_VOLUME, now + seconds + 0.6);
}

const SFX: Record<GtaSfx, { gap: number; play: (audio: AudioContext, bus: AudioNode) => void }> = {
  nav: {
    gap: 45,
    play: (audio, bus) => tone(audio, bus, { type: 'square', from: 1180, length: 0.03, gain: 0.1 }),
  },
  select: {
    gap: 40,
    play: (audio, bus) => {
      tone(audio, bus, { type: 'triangle', from: 880, length: 0.05, gain: 0.4 });
      tone(audio, bus, { type: 'triangle', from: 1320, at: 0.045, length: 0.07, gain: 0.35 });
    },
  },
  back: {
    gap: 40,
    play: (audio, bus) => {
      tone(audio, bus, { type: 'triangle', from: 660, length: 0.05, gain: 0.35 });
      tone(audio, bus, { type: 'triangle', from: 440, at: 0.045, length: 0.08, gain: 0.3 });
    },
  },
  toggle: {
    gap: 40,
    play: (audio, bus) =>
      tone(audio, bus, { type: 'square', from: 520, to: 780, length: 0.06, gain: 0.18 }),
  },
  error: {
    gap: 200,
    play: (audio, bus) =>
      tone(audio, bus, {
        type: 'sawtooth',
        from: 190,
        to: 150,
        length: 0.16,
        gain: 0.3,
        cutoff: 900,
      }),
  },
  cash: {
    gap: 120,
    play: (audio, bus) => {
      hiss(audio, bus, { length: 0.04, from: 6000, gain: 0.25, type: 'highpass' });
      tone(audio, bus, { from: 2093, at: 0.03, length: 0.22, gain: 0.3 });
      tone(audio, bus, { from: 2637, at: 0.09, length: 0.4, gain: 0.3 });
      tone(audio, bus, { from: 3136, at: 0.09, length: 0.3, gain: 0.12 });
    },
  },
  star: {
    gap: 250,
    play: (audio, bus) => {
      tone(audio, bus, {
        type: 'square',
        from: 620,
        to: 940,
        length: 0.16,
        gain: 0.2,
        cutoff: 2400,
      });
      tone(audio, bus, {
        type: 'square',
        from: 940,
        to: 620,
        at: 0.16,
        length: 0.18,
        gain: 0.2,
        cutoff: 2400,
      });
    },
  },
  clear: {
    gap: 250,
    play: (audio, bus) => {
      tone(audio, bus, { from: 784, length: 0.12, gain: 0.3 });
      tone(audio, bus, { from: 1047, at: 0.1, length: 0.12, gain: 0.3 });
      tone(audio, bus, { from: 1568, at: 0.2, length: 0.3, gain: 0.3 });
    },
  },
  cheat: {
    gap: 200,
    play: (audio, bus) => {
      [523, 659, 784, 1047, 1319].forEach((frequency, index) =>
        tone(audio, bus, {
          type: 'square',
          from: frequency,
          at: index * 0.055,
          length: 0.09,
          gain: 0.16,
          cutoff: 3200,
        }),
      );
    },
  },
  passed: {
    gap: 1500,
    play: (audio, bus) => {
      duck(2.6);
      // A brass-style stab that climbs to a held major chord.
      const chords = [
        { at: 0, notes: [196, 247, 294], length: 0.28 },
        { at: 0.3, notes: [220, 277, 330], length: 0.28 },
        { at: 0.6, notes: [262, 330, 392, 523], length: 1.9 },
      ];
      for (const chord of chords) {
        for (const note of chord.notes) {
          tone(audio, bus, {
            type: 'sawtooth',
            from: note,
            at: chord.at,
            length: chord.length,
            gain: 0.16,
            attack: 0.02,
            cutoff: 2200,
          });
          tone(audio, bus, {
            type: 'sawtooth',
            from: note * 1.004,
            at: chord.at,
            length: chord.length,
            gain: 0.1,
            attack: 0.02,
            cutoff: 1800,
          });
        }
      }
      hiss(audio, bus, {
        at: 0.6,
        length: 1.4,
        from: 9000,
        to: 3000,
        gain: 0.08,
        type: 'highpass',
      });
    },
  },
  busted: {
    gap: 1500,
    play: (audio, bus) => {
      duck(2.4);
      tone(audio, bus, { type: 'sawtooth', from: 110, to: 49, length: 2, gain: 0.4, cutoff: 500 });
      tone(audio, bus, { type: 'sawtooth', from: 164, to: 73, length: 2, gain: 0.25, cutoff: 600 });
      hiss(audio, bus, { length: 1.6, from: 900, to: 120, gain: 0.2, type: 'lowpass' });
    },
  },
  phone: {
    gap: 200,
    play: (audio, bus) => {
      tone(audio, bus, { from: 1400, length: 0.07, gain: 0.25 });
      tone(audio, bus, { from: 1870, at: 0.08, length: 0.1, gain: 0.25 });
    },
  },
  tune: {
    gap: 200,
    play: (audio, bus) => {
      hiss(audio, bus, { length: 0.32, from: 500, to: 4200, gain: 0.3, q: 4 });
      tone(audio, bus, { from: 300, to: 1800, length: 0.3, gain: 0.05 });
    },
  },
  chopper: {
    gap: 3000,
    play: (audio, bus) => {
      // Rotor thump: low noise chopped by a slow square wave, swelling and fading as it passes.
      if (!noise) return;
      const start = audio.currentTime;
      const length = 4.2;
      const source = audio.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      const chop = audio.createGain();
      chop.gain.value = 0.5;
      const lfo = audio.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 13;
      const depth = audio.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(chop.gain);
      const swell = audio.createGain();
      swell.gain.setValueAtTime(0.0001, start);
      swell.gain.exponentialRampToValueAtTime(0.7, start + length * 0.5);
      swell.gain.exponentialRampToValueAtTime(0.0001, start + length);
      source.connect(filter);
      filter.connect(chop);
      chop.connect(swell);
      swell.connect(bus);
      source.start(start);
      lfo.start(start);
      source.stop(start + length + 0.05);
      lfo.stop(start + length + 0.05);
    },
  },
  blip: {
    gap: 70,
    play: (audio, bus) => tone(audio, bus, { from: 1560, to: 1480, length: 0.09, gain: 0.14 }),
  },
  switch: {
    gap: 300,
    play: (audio, bus) => {
      hiss(audio, bus, { length: 0.5, from: 300, to: 5000, gain: 0.16, q: 2 });
      tone(audio, bus, { from: 220, to: 880, length: 0.45, gain: 0.12 });
      tone(audio, bus, { from: 1320, at: 0.45, length: 0.2, gain: 0.2 });
    },
  },
};

function synth(name: GtaSfx) {
  if (!context || !sfxBus) return;
  try {
    SFX[name].play(context, sfxBus);
  } catch {
    // A sound that cannot be built is skipped.
  }
}

/** Fetches and decodes one recording from this origin. Resolves to null when it cannot. */
function loadClip(name: string): Promise<AudioBuffer | null> {
  const cached = clips.get(name);
  if (cached) return Promise.resolve(cached);
  const audio = context;
  if (!audio || !gestured()) return Promise.resolve(null);
  let pending = loading.get(name);
  if (!pending) {
    pending = fetch(`${CLIP_BASE}${name}.mp3`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((data) => audio.decodeAudioData(data))
      .then((buffer) => {
        if (context === audio) clips.set(name, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => loading.delete(name));
    loading.set(name, pending);
  }
  return pending;
}

function startClip(buffer: AudioBuffer, gain: number): AudioBufferSourceNode | null {
  if (!context || !sfxBus) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const level = context.createGain();
  level.gain.value = gain;
  source.connect(level);
  level.connect(sfxBus);
  source.start();
  duck(buffer.duration);
  return source;
}

/**
 * Plays a recording through the interface bus. `fallback` is the synthesized cue to use when
 * the file cannot be loaded in time; `next` is a second recording to play right after.
 */
export function playGtaClip(
  name: GtaClip,
  options: { fallback?: GtaSfx; gain?: number; next?: GtaClip } = {},
) {
  if (!getGtaState().sound || !gestured()) return;
  const audio = ready();
  if (!audio || !sfxBus) return;
  const asked = performance.now();
  void loadClip(name).then((buffer) => {
    if (context !== audio || !getGtaState().sound) return;
    if (!buffer || performance.now() - asked > CLIP_PATIENCE_MS) {
      if (options.fallback) synth(options.fallback);
      return;
    }
    const source = startClip(buffer, options.gain ?? 1);
    const { next } = options;
    if (source && next) {
      void loadClip(next);
      source.addEventListener('ended', () => playGtaClip(next, { gain: options.gain }), {
        once: true,
      });
    }
  });
}

export function playGtaSfx(name: GtaSfx) {
  if (!getGtaState().sound || !gestured()) return;
  const audio = ready();
  if (!audio || !sfxBus) return;
  const now = performance.now();
  const spec = SFX[name];
  if (now - (lastStart.get(name) ?? -Infinity) < spec.gap) return;
  lastStart.set(name, now);
  const clip = SAMPLED[name];
  if (clip) {
    const buffer = clips.get(clip);
    if (buffer) {
      startClip(buffer, 1);
      return;
    }
    if (STINGERS.has(name)) {
      playGtaClip(clip, { fallback: name });
      return;
    }
    void loadClip(clip);
  }
  synth(name);
}

// ---------------------------------------------------------------------- radio

interface Station {
  bpm: number;
  /** Root notes of each bar, as semitones above A1 (55 Hz). */
  roots: number[];
  /** Semitone offsets from the root on each of the bar's 16 steps; null rests. */
  bass: (number | null)[];
  lead: (number | null)[];
  kick: number[];
  snare: number[];
  hat: number[];
  bassType: OscillatorType;
  leadType: OscillatorType;
  leadOctave: number;
  leadGlide: number;
  swing: number;
}

const R = null;
type SequencedStation = Exclude<GtaStation, RecordedStation>;
const STATION_DATA: Record<SequencedStation, Station> = {
  // Laid-back west coast cruise: rolling bass, high sine lead with a slow glide.
  lossantos: {
    bpm: 92,
    roots: [0, 0, 5, 3],
    bass: [0, R, R, 0, R, R, 7, R, 0, R, 10, R, R, 12, R, 7],
    lead: [R, R, R, R, 12, R, R, 15, R, R, 14, R, 12, R, R, R],
    kick: [0, 7, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14, 15],
    bassType: 'sawtooth',
    leadType: 'sine',
    leadOctave: 3,
    leadGlide: 0.09,
    swing: 0.16,
  },
  // Night drive: straight eighth bass, bright arpeggio.
  nonstop: {
    bpm: 112,
    roots: [0, 8, 3, 10],
    bass: [0, R, 0, R, 0, R, 0, R, 0, R, 0, R, 0, R, 0, 12],
    lead: [12, 19, 24, 19, 15, 19, 24, 19, 12, 19, 24, 19, 15, 19, 27, 24],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    bassType: 'square',
    leadType: 'square',
    leadOctave: 2,
    leadGlide: 0,
    swing: 0,
  },
  // Desert stomp: pentatonic riff, heavier drums.
  blaine: {
    bpm: 124,
    roots: [0, 0, 3, 5],
    bass: [0, 0, R, 3, R, 5, R, 0, 0, R, 7, 5, R, 3, 0, R],
    lead: [R, R, 12, R, 15, 12, R, R, 17, R, 15, R, 12, 10, R, R],
    kick: [0, 3, 8, 10],
    snare: [4, 12, 15],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bassType: 'sawtooth',
    leadType: 'sawtooth',
    leadOctave: 2,
    leadGlide: 0.02,
    swing: 0,
  },
};

const LOOKAHEAD = 0.28;
const TICK_MS = 90;
let timer: number | undefined;
let step = 0;
let nextTime = 0;
let playing: GtaStation | null = null;
/** The pattern the sequencer runs; a recorded station has none unless its file failed to load. */
let sequenced: SequencedStation | null = null;
let themeSource: AudioBufferSourceNode | null = null;
let lastLead = 0;

const hz = (semitones: number, octave = 0) => 55 * 2 ** (semitones / 12 + octave);

function scheduleStep(audio: AudioContext, bus: AudioNode, station: Station, at: number) {
  const index = step % 16;
  const bar = Math.floor(step / 16);
  const root = station.roots[bar % station.roots.length];
  const sixteenth = 60 / station.bpm / 4;
  const when = at - audio.currentTime + (index % 2 === 1 ? station.swing * sixteenth : 0);
  if (station.kick.includes(index)) {
    tone(audio, bus, { from: 150, to: 44, at: when, length: 0.22, gain: 0.9 });
  }
  if (station.snare.includes(index)) {
    hiss(audio, bus, { at: when, length: 0.16, from: 1800, gain: 0.4, q: 0.7 });
    tone(audio, bus, { type: 'triangle', from: 210, to: 150, at: when, length: 0.09, gain: 0.25 });
  }
  if (station.hat.includes(index)) {
    hiss(audio, bus, { at: when, length: 0.04, from: 8000, gain: 0.12, type: 'highpass' });
  }
  const bass = station.bass[index];
  if (bass !== null) {
    tone(audio, bus, {
      type: station.bassType,
      from: hz(root + bass, 0),
      at: when,
      length: sixteenth * 1.7,
      gain: 0.5,
      attack: 0.01,
      cutoff: 520,
    });
  }
  // The lead sits out every fourth bar so the loop breathes.
  const lead = bar % 4 === 3 ? null : station.lead[index];
  if (lead !== null) {
    const frequency = hz(root + lead, station.leadOctave);
    const from = station.leadGlide > 0 && lastLead > 0 ? lastLead : frequency;
    const start = audio.currentTime + when;
    const length = sixteenth * (station.leadGlide > 0 ? 2.6 : 0.9);
    const oscillator = audio.createOscillator();
    oscillator.type = station.leadType;
    oscillator.frequency.setValueAtTime(from, start);
    if (from !== frequency)
      oscillator.frequency.exponentialRampToValueAtTime(frequency, start + station.leadGlide);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(station.leadType === 'sine' ? 0.3 : 0.11, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = station.leadType === 'sine' ? 6000 : 2600;
    oscillator.connect(gain);
    gain.connect(filter);
    filter.connect(bus);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
    lastLead = frequency;
  }
}

function pump() {
  if (!context || !musicBus || !sequenced) return;
  // A hidden tab throttles timers; skip ahead instead of scheduling a burst of late notes.
  if (nextTime < context.currentTime - 0.2) nextTime = context.currentTime + 0.05;
  const station = STATION_DATA[sequenced];
  const sixteenth = 60 / station.bpm / 4;
  while (nextTime < context.currentTime + LOOKAHEAD) {
    try {
      scheduleStep(context, musicBus, station, nextTime);
    } catch {
      // Skip a step that cannot be scheduled.
    }
    nextTime += sixteenth;
    step++;
  }
}

function saveBar() {
  try {
    window.sessionStorage.setItem(BAR_KEY, String(Math.floor(step / 16)));
  } catch {
    // Without session storage the radio starts from the top after a reload.
  }
}

function savedBar(): number {
  try {
    return Number.parseInt(window.sessionStorage.getItem(BAR_KEY) ?? '', 10) || 0;
  } catch {
    return 0;
  }
}

function stopTheme() {
  const source = themeSource;
  themeSource = null;
  if (!source) return;
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
  source.disconnect();
}

function stopSequencer() {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  if (sequenced) saveBar();
  sequenced = null;
}

function startSequencer(audio: AudioContext, station: SequencedStation) {
  if (sequenced === station && timer !== undefined) return;
  step = sequenced === null ? savedBar() * 16 : Math.floor(step / 16) * 16;
  sequenced = station;
  lastLead = 0;
  nextTime = audio.currentTime + 0.12;
  if (timer === undefined) timer = window.setInterval(pump, TICK_MS);
  pump();
}

/** Loops a recorded theme; if the file cannot be loaded the first sequenced station plays. */
function startTheme(audio: AudioContext, station: RecordedStation) {
  const { file, gain } = RECORDED[station];
  void loadClip(file).then((buffer) => {
    if (context !== audio || playing !== station || !musicBus || themeSource) return;
    if (!buffer) {
      startSequencer(audio, 'lossantos');
      return;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const level = audio.createGain();
    level.gain.value = 0;
    level.gain.linearRampToValueAtTime(gain, audio.currentTime + 1.2);
    source.connect(level);
    level.connect(musicBus);
    source.start();
    themeSource = source;
  });
}

export function stopGtaRadio() {
  stopSequencer();
  stopTheme();
  playing = null;
}

/** Starts or retunes the radio to the saved station, or stops it when the radio is off. */
export function syncGtaRadio() {
  const { music, station } = getGtaState();
  if (!music || disposed) {
    stopGtaRadio();
    return;
  }
  const audio = ready();
  if (!audio || !musicBus) return;
  if (!gestured()) return;
  if (playing === station && (themeSource !== null || timer !== undefined)) return;
  playing = station;
  stopTheme();
  if (isRecorded(station)) {
    stopSequencer();
    startTheme(audio, station);
    return;
  }
  startSequencer(audio, station);
}

/** Narrows the radio like a police scanner as the wanted level climbs. */
export function setGtaRadioHeat(wanted: number) {
  if (!context || !musicFilter) return;
  const cutoff = wanted >= 4 ? 1500 : wanted >= 2 ? 3600 : 9000;
  musicFilter.frequency.setTargetAtTime(cutoff, context.currentTime, 0.4);
}

export function gtaRadioPlaying(): boolean {
  return playing !== null;
}

/** True once a user gesture has created the audio context. */
export function gtaAudioStarted(): boolean {
  return context !== null;
}

/** Called on the first user gesture so later sounds start without delay. */
export function unlockGtaAudio() {
  unlocked = true;
  if (!ready()) return;
  syncGtaRadio();
  if (getGtaState().sound) for (const clip of PRELOAD) void loadClip(clip);
}

export function disposeGtaAudio() {
  stopGtaRadio();
  disposed = true;
  const audio = context;
  context = null;
  sfxBus = null;
  musicBus = null;
  musicFilter = null;
  noise = null;
  lastStart.clear();
  clips.clear();
  loading.clear();
  if (audio) void audio.close().catch(() => {});
}

/** Allows the engine to be used again after a dispose (the theme was selected again). */
export function reviveGtaAudio() {
  disposed = false;
}
