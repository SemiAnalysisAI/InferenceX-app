/**
 * Web Audio engine for the LEGO theme. Nothing is fetched or created until the first user
 * gesture, every clip is fetched the first time it is needed, and `disposeLegoAudio` tears the
 * whole graph down when the theme unmounts. No media elements are ever added to the DOM.
 */
import { getLegoState } from './lego-store';

export type LegoClip =
  | 'snap-1'
  | 'snap-2'
  | 'snap-3'
  | 'snap-4'
  | 'tick'
  | 'pour'
  | 'shake-1'
  | 'shake-2'
  | 'rattle'
  | 'build'
  | 'breaking'
  | 'fall-apart'
  | 'stud'
  | 'awesome'
  | 'pants'
  | 'spaceship'
  | 'rest-in-pieces'
  | 'touch-that'
  | 'good-morning'
  | 'brick-system'
  | 'yoda-death'
  | 'lego-city'
  | 'batman-black'
  | 'first-try'
  | 'whoops-cd'
  | 'minikit';

interface PlayOptions {
  volume?: number;
  rate?: number;
  /** Minimum gap in ms before the same clip may start again. */
  gap?: number;
  /** Seconds from now. */
  delay?: number;
}

const BASE = '/decorative/lego/audio/';
const SFX_VOLUME = 0.4;
const VOICE_VOLUME = 0.6;
const MUSIC_VOLUME = 0.16;
const MAX_VOICES = 10;
const SNAPS: readonly LegoClip[] = ['snap-1', 'snap-2', 'snap-3', 'snap-4'];

let context: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let disposed = false;
let activeVoices = 0;
let speech: AudioBufferSourceNode | null = null;
const buffers = new Map<LegoClip, Promise<AudioBuffer | null>>();
const lastStart = new Map<string, number>();
const abort = { controller: null as AbortController | null };

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
  sfxBus = context.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(context.destination);
  musicBus = context.createGain();
  musicBus.gain.value = MUSIC_VOLUME;
  musicBus.connect(context.destination);
  abort.controller = new AbortController();
  return context;
}

/** True once the page has seen a click, tap or key press. */
export function hasUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  return activation ? activation.hasBeenActive : context !== null;
}

/** Call from a user gesture. Creates the context on first use and resumes it if suspended. */
export function unlockLegoAudio(): boolean {
  disposed = false;
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return true;
}

export function legoAudioReady(): boolean {
  return context !== null && context.state !== 'closed';
}

function loadClip(name: LegoClip): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const ctx = context;
  if (!ctx) return Promise.resolve(null);
  const promise = fetch(`${BASE}${name}.mp3`, { signal: abort.controller?.signal })
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
  buffers.set(name, promise);
  return promise;
}

function start(
  buffer: AudioBuffer,
  bus: GainNode,
  { volume = 1, rate = 1, delay = 0 }: PlayOptions,
): AudioBufferSourceNode | null {
  const ctx = context;
  if (!ctx || ctx.state === 'closed') return null;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  gain.gain.value = volume;
  source.connect(gain).connect(bus);
  activeVoices += 1;
  source.addEventListener('ended', () => {
    activeVoices = Math.max(0, activeVoices - 1);
    source.disconnect();
    gain.disconnect();
  });
  source.start(ctx.currentTime + delay);
  return source;
}

function allowed(key: string, gap: number): boolean {
  const now = performance.now();
  if (now - (lastStart.get(key) ?? -Infinity) < gap) return false;
  lastStart.set(key, now);
  return true;
}

/** Plays a short effect. Silently does nothing when muted, locked or rate-limited. */
export function playSfx(name: LegoClip, options: PlayOptions = {}): void {
  if (!context || !sfxBus || !getLegoState().sound) return;
  if (activeVoices >= MAX_VOICES || !allowed(name, options.gap ?? 70)) return;
  const bus = sfxBus;
  void loadClip(name).then((buffer) => {
    if (!buffer || !getLegoState().sound) return;
    start(buffer, bus, { ...options, volume: (options.volume ?? 1) * SFX_VOLUME });
  });
}

/** A brick snap with a little pitch variation so repeated clicks do not sound identical. */
export function playSnap(volume = 1, rate = 1): void {
  if (!allowed('snap', 55)) return;
  const clip = SNAPS[Math.floor(Math.random() * SNAPS.length)];
  playSfx(clip, { volume, rate: rate * (0.92 + Math.random() * 0.2), gap: 0 });
}

function duck(seconds: number) {
  const ctx = context;
  if (!ctx || !musicBus) return;
  const now = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(MUSIC_VOLUME * 0.25, now, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_VOLUME, now + seconds, 0.3);
}

/**
 * Plays a spoken line or the song sting. Only one plays at a time; a new one replaces the old.
 * `channel` picks which preference gates it.
 */
export function playVoice(name: LegoClip, channel: 'sound' | 'music' = 'sound'): void {
  if (!context || !sfxBus || !getLegoState()[channel]) return;
  if (!allowed(`voice:${name}`, 1200)) return;
  const bus = sfxBus;
  void loadClip(name).then((buffer) => {
    if (!buffer || !getLegoState()[channel]) return;
    try {
      speech?.stop();
    } catch {
      // Already ended.
    }
    speech = start(buffer, bus, { volume: VOICE_VOLUME });
    duck(buffer.duration);
  });
}

// ---------------------------------------------------------------- music
// One looped cut of the instrumental of "Everything Is Awesome!!!" (see the README for where
// it came from). The file carries 0.3 s of the loop's own audio before and after the loop
// points, so the decoder's padding never lands inside the loop. It plays through a buffer
// source, never a media element, and the position is kept for the tab so a reload resumes it.

const MUSIC_FILE = 'everything-is-awesome';
const LOOP_START = 0.3;
const LOOP_END = 52.1911;
const MUSIC_AT_KEY = 'lego-music-at';

let musicSource: AudioBufferSourceNode | null = null;
let musicBuffer: Promise<AudioBuffer | null> | null = null;
let musicWanted = false;
/** Context time at which the loop point was (or would have been) at its start. */
let musicEpoch = 0;

function loadMusic(): Promise<AudioBuffer | null> {
  if (musicBuffer) return musicBuffer;
  const ctx = context;
  if (!ctx) return Promise.resolve(null);
  musicBuffer = fetch(`${BASE}${MUSIC_FILE}.mp3`, { signal: abort.controller?.signal })
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
  return musicBuffer;
}

function musicPosition(): number {
  const ctx = context;
  if (!ctx) return 0;
  const length = LOOP_END - LOOP_START;
  return (((ctx.currentTime - musicEpoch) % length) + length) % length;
}

function rememberMusic() {
  try {
    window.sessionStorage.setItem(MUSIC_AT_KEY, musicPosition().toFixed(2));
  } catch {
    // Storage is optional: the tune then starts from the top.
  }
}

function resumeMusicAt(): number {
  try {
    const at = Number.parseFloat(window.sessionStorage.getItem(MUSIC_AT_KEY) ?? '');
    return Number.isFinite(at) && at >= 0 && at < LOOP_END - LOOP_START ? at : 0;
  } catch {
    return 0;
  }
}

export function legoMusicPlaying(): boolean {
  return musicWanted;
}

/** Starts the loop if the music preference is on and audio has been unlocked. */
export function startLegoMusic(): void {
  const ctx = context;
  if (!ctx || musicWanted || !getLegoState().music || document.hidden) return;
  // Reserve the slot first so two quick calls cannot start two loops.
  musicWanted = true;
  void loadMusic().then((buffer) => {
    const bus = musicBus;
    if (!buffer || !bus || !musicWanted || musicSource || context !== ctx) return;
    if (!getLegoState().music || ctx.state === 'closed') return;
    const offset = resumeMusicAt();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = LOOP_START;
    source.loopEnd = Math.min(LOOP_END, buffer.duration);
    source.connect(bus);
    // Fade in so the tune never starts with a click.
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + 0.6);
    source.start(now, LOOP_START + offset);
    musicEpoch = now - offset;
    musicSource = source;
  });
}

export function stopLegoMusic(): void {
  if (!musicWanted) return;
  musicWanted = false;
  const source = musicSource;
  musicSource = null;
  if (!source) return;
  rememberMusic();
  try {
    source.stop();
  } catch {
    // Already ended.
  }
  source.disconnect();
}

/** Stops every sound and releases the context. Safe to call more than once. */
export function disposeLegoAudio(): void {
  disposed = true;
  stopLegoMusic();
  abort.controller?.abort();
  abort.controller = null;
  try {
    speech?.stop();
  } catch {
    // Already ended.
  }
  speech = null;
  musicBuffer = null;
  buffers.clear();
  lastStart.clear();
  activeVoices = 0;
  const ctx = context;
  context = null;
  sfxBus = null;
  musicBus = null;
  if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
}
