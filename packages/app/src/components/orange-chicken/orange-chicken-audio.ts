/**
 * Web Audio engine for the Orange Chicken theme. Most sounds are synthesised here. Two short
 * recorded clips (a kitchen service bell and a wok sizzle, see public/decorative/orange-chicken/)
 * are fetched and decoded after the first user gesture, and only while the theme is active; until
 * they are decoded the synthesised versions play. Nothing is created before the first gesture. Two buses: effects, and a music
 * bed that ducks under effects instead of stopping. `disposeOcAudio` closes the whole graph when
 * the theme unmounts or the game closes.
 */
import { getOcState, setMusicEnabled, setSoundEnabled } from './orange-chicken-store';

export type OcSfx =
  | 'tap'
  | 'hover'
  | 'clang'
  | 'chop'
  | 'bell'
  | 'sizzle'
  | 'pop'
  | 'stamp'
  | 'error'
  | 'coin'
  | 'serve'
  | 'fanfare'
  | 'whoosh'
  | 'splat';

interface MusicParams {
  /** Beats per minute, 60 to 150. */
  tempo: number;
  /** Low-pass cutoff in Hz: the music opens up as the kitchen heats up. */
  cutoff: number;
  /** 0 to 1: adds percussion and a second voice. */
  energy: number;
  /** Semitone shift, used for the boss act. */
  shift: number;
}

const SFX_LEVEL = 0.5;
const MUSIC_LEVEL = 0.16;
const ROOT_HZ = 146.83;
/**
 * Mo Li Hua (Jasmine Flower), a Chinese folk melody that is the usual background tune in
 * Chinese-American restaurants. Note data [start in sixteenths, length in sixteenths, semitones
 * above D3] read from Commons Maturika.mid (see public/decorative/orange-chicken/README.md). The
 * tune is looped; no recording is shipped.
 */
const MOLIHUA: readonly (readonly [number, number, number])[] = [
  [0, 4, 16],
  [4, 2, 16],
  [6, 2, 19],
  [8, 4, 21],
  [12, 2, 24],
  [14, 2, 21],
  [16, 6, 19],
  [22, 2, 21],
  [24, 8, 19],
  [32, 4, 16],
  [36, 2, 16],
  [38, 2, 19],
  [40, 4, 21],
  [44, 2, 24],
  [46, 2, 21],
  [48, 6, 19],
  [54, 2, 21],
  [56, 8, 19],
  [64, 4, 16],
  [68, 4, 19],
  [72, 2, 16],
  [74, 2, 19],
  [76, 4, 21],
  [80, 2, 24],
  [82, 2, 21],
  [84, 8, 19],
  [92, 4, 16],
  [96, 4, 14],
  [100, 2, 16],
  [102, 2, 19],
  [104, 2, 16],
  [106, 2, 14],
  [108, 6, 12],
  [114, 2, 14],
  [116, 4, 12],
  [124, 4, 16],
  [128, 4, 12],
  [132, 4, 14],
  [136, 2, 14],
  [138, 2, 16],
  [140, 4, 19],
  [144, 4, 21],
  [148, 2, 19],
  [150, 2, 21],
  [152, 2, 19],
  [154, 2, 16],
  [156, 2, 14],
  [158, 2, 16],
  [160, 4, 19],
  [164, 2, 14],
  [166, 2, 19],
  [168, 2, 16],
  [170, 2, 14],
  [172, 8, 12],
  [184, 2, 9],
  [186, 2, 12],
  [188, 6, 14],
  [194, 2, 16],
  [196, 4, 12],
  [200, 4, 9],
  [204, 6, 7],
  [210, 2, 9],
  [212, 8, 7],
  [220, 4, 16],
  [224, 4, 12],
  [228, 4, 14],
  [232, 2, 14],
  [234, 2, 16],
  [236, 4, 19],
  [240, 4, 21],
  [244, 2, 19],
  [246, 2, 21],
  [248, 2, 19],
  [250, 2, 16],
  [252, 2, 14],
  [254, 2, 16],
  [256, 4, 19],
  [260, 2, 14],
  [262, 2, 19],
  [264, 2, 16],
  [266, 2, 14],
  [268, 8, 12],
  [280, 2, 9],
  [282, 2, 12],
  [284, 6, 14],
  [290, 2, 16],
  [292, 4, 12],
  [296, 4, 9],
  [300, 6, 7],
  [306, 2, 9],
  [308, 8, 7],
];
const MOLIHUA_LOOP = 316;
const MOLIHUA_AT = new Map<number, readonly [number, number, number]>(
  MOLIHUA.map((n) => [n[0], n]),
);

let context: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let disposed = false;
let schedulerTimer: number | undefined;
let nextStepTime = 0;
let step = 0;
let musicOn = false;
let duckTimer: number | undefined;
const lastPlayed = new Map<string, number>();
const SAMPLE_URLS = {
  bell: '/decorative/orange-chicken/oc-service-bell.ogg',
  sizzle: '/decorative/orange-chicken/oc-wok-sizzle.ogg',
} as const;
const samples = new Map<keyof typeof SAMPLE_URLS, AudioBuffer>();
const sampleLoads = new Set<keyof typeof SAMPLE_URLS>();

/** Fetches and decodes one clip after the gesture-created context exists. Fails quietly. */
function loadSample(name: keyof typeof SAMPLE_URLS) {
  const ctx = context;
  if (!ctx || samples.has(name) || sampleLoads.has(name)) return;
  sampleLoads.add(name);
  fetch(SAMPLE_URLS[name])
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('missing'))))
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      if (context === ctx) samples.set(name, buffer);
    })
    .catch(() => sampleLoads.delete(name));
}

function playSample(
  ctx: AudioContext,
  name: keyof typeof SAMPLE_URLS,
  gain: number,
  rate = 1,
  seconds?: number,
): boolean {
  const buffer = samples.get(name);
  const bus = sfxBus;
  if (!buffer || !bus) {
    loadSample(name);
    return false;
  }
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  amp.gain.value = gain;
  source.connect(amp).connect(bus);
  source.start();
  if (seconds) {
    amp.gain.setTargetAtTime(0.0001, ctx.currentTime + seconds, 0.12);
    source.stop(ctx.currentTime + seconds + 0.6);
  }
  return true;
}
const params: MusicParams = { tempo: 88, cutoff: 2600, energy: 0.2, shift: 0 };

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
  const compressor = context.createDynamicsCompressor();
  compressor.connect(context.destination);
  sfxBus = context.createGain();
  sfxBus.gain.value = SFX_LEVEL;
  sfxBus.connect(compressor);
  musicFilter = context.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = params.cutoff;
  musicFilter.Q.value = 0.7;
  musicBus = context.createGain();
  musicBus.gain.value = MUSIC_LEVEL;
  musicBus.connect(musicFilter);
  musicFilter.connect(compressor);
  return context;
}

/** Call from a user gesture. Creates the context on first use and resumes it if suspended. */
export function unlockOcAudio(): boolean {
  disposed = false;
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  loadSample('bell');
  loadSample('sizzle');
  return true;
}

export function ocAudioReady(): boolean {
  return context !== null && context.state !== 'closed';
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

interface ToneOptions {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  length: number;
  gain?: number;
  attack?: number;
  bus?: GainNode | null;
  detune?: number;
}

function tone(ctx: AudioContext, options: ToneOptions) {
  const { type = 'sine', from, to, at = 0, length, gain = 0.4, attack = 0.004 } = options;
  const bus = options.bus ?? sfxBus;
  if (!bus) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + length);
  if (options.detune) osc.detune.value = options.detune;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(amp).connect(bus);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

function burst(
  ctx: AudioContext,
  {
    at = 0,
    length,
    gain = 0.3,
    filter = 'highpass',
    freq = 2000,
    q = 0.7,
    bus = sfxBus,
  }: {
    at?: number;
    length: number;
    gain?: number;
    filter?: BiquadFilterType;
    freq?: number;
    q?: number;
    bus?: GainNode | null;
  },
) {
  if (!bus) return;
  const start = ctx.currentTime + at;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = freq;
  biquad.Q.value = q;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
  source.connect(biquad).connect(amp).connect(bus);
  source.start(start);
  source.stop(start + length + 0.05);
}

const note = (semitones: number) => ROOT_HZ * 2 ** ((semitones + params.shift) / 12);

/** Plays one effect. Safe to call at any time; it does nothing until audio is unlocked. */
export function playOcSfx(name: OcSfx, options: { gap?: number; rate?: number } = {}) {
  if (!getOcState().sound) return;
  const ctx = context;
  if (!ctx || ctx.state === 'closed' || disposed) return;
  if (ctx.state === 'suspended') return;
  const now = performance.now();
  const gap = options.gap ?? (name === 'hover' ? 90 : 20);
  const last = lastPlayed.get(name) ?? -Infinity;
  if (now - last < gap) return;
  lastPlayed.set(name, now);
  const rate = options.rate ?? 1;
  switch (name) {
    case 'tap': {
      tone(ctx, { type: 'triangle', from: 880 * rate, to: 520 * rate, length: 0.07, gain: 0.22 });
      break;
    }
    case 'hover': {
      tone(ctx, { type: 'sine', from: 1500 * rate, to: 1250 * rate, length: 0.035, gain: 0.05 });
      break;
    }
    case 'clang': {
      for (const [freq, gain, length] of [
        [392 * rate, 0.3, 0.5],
        [1010 * rate, 0.18, 0.32],
        [1760 * rate, 0.1, 0.2],
      ] as const) {
        tone(ctx, { type: 'sine', from: freq, to: freq * 0.985, length, gain });
      }
      burst(ctx, { length: 0.04, gain: 0.2, freq: 3000 });
      break;
    }
    case 'chop': {
      tone(ctx, { type: 'sine', from: 190 * rate, to: 55, length: 0.12, gain: 0.5 });
      burst(ctx, { length: 0.05, gain: 0.35, freq: 1800 });
      break;
    }
    case 'bell': {
      if (playSample(ctx, 'bell', 0.9, rate)) break;
      tone(ctx, { type: 'sine', from: 1318 * rate, length: 0.9, gain: 0.3 });
      tone(ctx, { type: 'sine', from: 1976 * rate, length: 0.6, gain: 0.14 });
      tone(ctx, { type: 'sine', from: 3951 * rate, length: 0.25, gain: 0.05 });
      break;
    }
    case 'sizzle': {
      if (playSample(ctx, 'sizzle', 0.5, rate, 1.4)) break;
      burst(ctx, { length: 0.55, gain: 0.14, filter: 'bandpass', freq: 5200, q: 0.5 });
      break;
    }
    case 'pop': {
      tone(ctx, { type: 'sine', from: 280 * rate, to: 760 * rate, length: 0.08, gain: 0.3 });
      break;
    }
    case 'stamp': {
      tone(ctx, { type: 'sine', from: 130, to: 40, length: 0.22, gain: 0.7 });
      burst(ctx, { length: 0.08, gain: 0.3, filter: 'lowpass', freq: 900 });
      break;
    }
    case 'error': {
      tone(ctx, { type: 'sawtooth', from: 150, to: 80, length: 0.28, gain: 0.2 });
      break;
    }
    case 'coin': {
      tone(ctx, { type: 'square', from: 988 * rate, length: 0.07, gain: 0.1 });
      tone(ctx, { type: 'square', from: 1319 * rate, at: 0.07, length: 0.22, gain: 0.1 });
      break;
    }
    case 'serve': {
      tone(ctx, { type: 'triangle', from: note(12) * rate, length: 0.14, gain: 0.25 });
      tone(ctx, { type: 'triangle', from: note(19) * rate, at: 0.08, length: 0.3, gain: 0.25 });
      break;
    }
    case 'fanfare': {
      [0, 4, 7, 12, 16, 19].forEach((semi, index) =>
        tone(ctx, {
          type: 'triangle',
          from: note(semi + 12),
          at: index * 0.09,
          length: index === 5 ? 0.9 : 0.25,
          gain: 0.25,
        }),
      );
      break;
    }
    case 'whoosh': {
      burst(ctx, { length: 0.25, gain: 0.18, filter: 'bandpass', freq: 1200, q: 0.8 });
      break;
    }
    case 'splat': {
      tone(ctx, { type: 'sine', from: 320, to: 90, length: 0.14, gain: 0.4 });
      burst(ctx, { length: 0.1, gain: 0.25, filter: 'lowpass', freq: 1400 });
      break;
    }
  }
}

/** Dips the music under an effect or a spoken line and brings it back. Never stops it. */
export function duckOcMusic(depth = 0.35, ms = 700) {
  if (!context || !musicBus) return;
  const now = context.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL * depth, now, 0.05);
  window.clearTimeout(duckTimer);
  duckTimer = window.setTimeout(() => {
    if (!context || !musicBus) return;
    musicBus.gain.setTargetAtTime(MUSIC_LEVEL, context.currentTime, 0.25);
  }, ms);
}

/** Real-time music controls: the game ties these to heat, combo and the act. */
export function setOcMusicParams(next: Partial<MusicParams>) {
  Object.assign(params, next);
  if (context && musicFilter) {
    musicFilter.frequency.setTargetAtTime(params.cutoff, context.currentTime, 0.2);
  }
}

export function resetOcMusicParams() {
  setOcMusicParams({ tempo: 88, cutoff: 2600, energy: 0.2, shift: 0 });
}

// ----------------------------------------------------------------- music bed
// A procedural loop: pentatonic plucks (guzheng-like), an erhu-like bowed line with vibrato, a
// drone, and wood-block percussion that arrives with `energy`. Scheduled a little ahead of time.
function pluck(ctx: AudioContext, freq: number, at: number, gain: number) {
  const bus = musicBus;
  if (!bus) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq * 1.01, start);
  osc.frequency.exponentialRampToValueAtTime(freq, start + 0.04);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
  osc.connect(amp).connect(bus);
  osc.start(start);
  osc.stop(start + 1.2);
}

function bow(ctx: AudioContext, freq: number, at: number, length: number, gain: number) {
  const bus = musicBus;
  if (!bus) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const amp = ctx.createGain();
  const body = ctx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  lfo.frequency.value = 5.2;
  lfoGain.gain.value = freq * 0.012;
  lfo.connect(lfoGain).connect(osc.frequency);
  body.type = 'bandpass';
  body.frequency.value = Math.min(2200, freq * 3);
  body.Q.value = 1.4;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(gain, start + length * 0.3);
  amp.gain.linearRampToValueAtTime(0.0001, start + length);
  osc.connect(body).connect(amp).connect(bus);
  osc.start(start);
  lfo.start(start);
  osc.stop(start + length + 0.05);
  lfo.stop(start + length + 0.05);
}

function woodBlock(ctx: AudioContext, at: number, gain: number, high = false) {
  const bus = musicBus;
  if (!bus) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = high ? 1100 : 760;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  osc.connect(amp).connect(bus);
  osc.start(start);
  osc.stop(start + 0.08);
}

function scheduleStep(ctx: AudioContext, at: number, index: number) {
  const pos = index % MOLIHUA_LOOP;
  const beat = pos % 16;
  // Bass: tonic and fifth under the tune, one pluck per half bar.
  if (beat === 0 || beat === 8) pluck(ctx, note((beat === 0 ? 0 : -5) - 12), at, 0.45);
  // Melody: the tune itself, as plucks with a bowed line on the longer notes.
  const n = MOLIHUA_AT.get(pos);
  if (n) {
    const semi = n[2];
    const sixteenth = 60 / params.tempo / 4;
    pluck(ctx, note(semi), at, 0.4);
    if (n[1] >= 4) bow(ctx, note(semi), at, sixteenth * n[1], 0.06 + params.energy * 0.08);
  }
  if (params.energy > 0.35) {
    if (beat % 4 === 2) woodBlock(ctx, at, 0.12 + params.energy * 0.1, false);
    if (beat % 2 === 1 && params.energy > 0.6) woodBlock(ctx, at, 0.06, true);
  }
}

function schedule() {
  const ctx = context;
  if (!ctx || !musicOn || ctx.state !== 'running') return;
  const sixteenth = 60 / params.tempo / 4;
  if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
  while (nextStepTime < ctx.currentTime + 0.25) {
    scheduleStep(ctx, nextStepTime - ctx.currentTime, step);
    nextStepTime += sixteenth;
    step++;
  }
}

export function startOcMusic() {
  if (!getOcState().music) return;
  if (!unlockOcAudio()) return;
  if (musicOn) return;
  musicOn = true;
  nextStepTime = 0;
  schedulerTimer = window.setInterval(schedule, 60);
}

export function stopOcMusic() {
  musicOn = false;
  window.clearInterval(schedulerTimer);
  schedulerTimer = undefined;
}

export function ocMusicPlaying(): boolean {
  return musicOn;
}

/** Tears everything down: timers, the music scheduler and the audio context. */
export function disposeOcAudio() {
  stopOcMusic();
  window.clearTimeout(duckTimer);
  disposed = true;
  const ctx = context;
  context = null;
  sfxBus = null;
  musicBus = null;
  musicFilter = null;
  noiseBuffer = null;
  samples.clear();
  sampleLoads.clear();
  lastPlayed.clear();
  if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
}

/** Flips the site-wide sound switch, and says clang when it turns on. Returns the new value. */
export function toggleOcSound(): boolean {
  const next = !getOcState().sound;
  setSoundEnabled(next);
  if (next) {
    unlockOcAudio();
    playOcSfx('clang');
  }
  return next;
}

/** Flips the music switch and starts or stops the bed. Returns the new value. */
export function toggleOcMusic(): boolean {
  const next = !getOcState().music;
  setMusicEnabled(next);
  if (next) {
    unlockOcAudio();
    startOcMusic();
  } else stopOcMusic();
  return next;
}
