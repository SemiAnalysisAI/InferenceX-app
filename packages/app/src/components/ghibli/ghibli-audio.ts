import {
  GHIBLI_MUSIC_EVENT,
  GHIBLI_SOUND_EVENT,
  asset,
  ghibliMusicEnabled,
  ghibliSoundEnabled,
} from './ghibli-prefs';

export type GhibliSound =
  | 'chime'
  | 'kodama-rattle'
  | 'crackle'
  | 'soot-rustle'
  | 'wave'
  | 'wingflap'
  | 'parakeet'
  | 'coin'
  | 'wind';

interface PlayOptions {
  volume?: number;
  rate?: number;
  /** Minimum gap between two plays of this sound, in ms. */
  gap?: number;
}

const DEFAULT_GAP: Record<GhibliSound, number> = {
  chime: 600,
  'kodama-rattle': 700,
  crackle: 4000,
  'soot-rustle': 1500,
  wave: 6000,
  wingflap: 30_000,
  parakeet: 20_000,
  coin: 800,
  wind: 8000,
};

/** Short excerpts of Joe Hisaishi's film themes, played on signature moments. */
export type GhibliSting =
  | 'theme-ponyo'
  | 'theme-noface'
  | 'theme-sixth-station'
  | 'theme-merry-go-round'
  | 'theme-kodama';

const STING_FALLBACK: Record<GhibliSting, GhibliSound> = {
  'theme-ponyo': 'wave',
  'theme-noface': 'coin',
  'theme-sixth-station': 'wave',
  'theme-merry-go-round': 'crackle',
  'theme-kodama': 'kodama-rattle',
};

const MASTER_VOLUME = 0.6;
const MUSIC_VOLUME = 0.12;
const STING_VOLUME = 0.34;
/** The same sting never repeats within this window, and two stings never overlap. */
const STING_GAP_MS = 60_000;
const STING_ANY_GAP_MS = 14_000;
const GLOBAL_GAP_MS = 140;
const MUSIC_TRACK = 'music-one-summers-day';
const MEADOW_AT_KEY = 'ghibli-music-at';

/** Controls that get a soft, pitch-varied tick when clicked. */
const UI_SELECTOR = [
  'button',
  'a[href]',
  "[role='switch']",
  "[role='tab']",
  "[role='option']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[data-slot='select-trigger']",
  'summary',
].join(',');
const CHART_SELECTOR = "[data-testid='d3-chart-svg'], canvas";
const HOVER_SELECTOR = ".ghibli-film-chip, .ghibli-boiler-launch, [data-slot='button']";

function readMeadowOffset(): number {
  try {
    const value = Number(sessionStorage.getItem(MEADOW_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Sparse WebAudio sound effects, an optional loop of Joe Hisaishi's "One Summer's Day" and
 * short theme stings. Nothing is created or
 * fetched before the first user gesture, every file is fetched on first use, and `dispose()`
 * stops playback, closes the context and removes every listener.
 */
export class GhibliAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lastPlayed = new Map<string, number>();
  private lastAny = 0;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicStarting = false;
  private disposed = false;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private musicStartedAt = 0;
  private musicOffset = 0;
  /** Called each time the music loop actually starts playing. */
  onMusicStart: (() => void) | null = null;
  private duckLevel = 1;
  private stingDuck = 1;
  private lastSting = 0;
  private stingTimer = 0;
  private uiTick = 0;

  constructor() {
    window.addEventListener('pointerdown', this.onGesture, true);
    window.addEventListener('keydown', this.onGesture, true);
    window.addEventListener(GHIBLI_MUSIC_EVENT, this.syncMusic);
    window.addEventListener(GHIBLI_SOUND_EVENT, this.syncSound);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('pointerover', this.onHover, true);
    window.addEventListener('pagehide', this.saveMeadow);
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  /** The shared context and output bus, for the mini-game's synthesised voices. */
  get audioContext(): AudioContext | null {
    return this.context;
  }

  get output(): GainNode | null {
    return this.master;
  }

  /** Lower (never stop) the music loop while something else plays music. 1 restores it. */
  duck(level: number): void {
    this.duckLevel = Math.max(0, Math.min(1, level));
    this.rampMusic();
  }

  private rampMusic(): void {
    const context = this.context;
    const gain = this.musicGain;
    if (!context || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(
      MUSIC_VOLUME * this.duckLevel * this.stingDuck,
      context.currentTime + 0.8,
    );
  }

  /**
   * A film theme excerpt for a signature moment. It counts as music: it needs both the sound
   * and the music toggle, and dips the loop while it plays. With music off it falls back to the
   * matching sound effect.
   */
  sting(name: GhibliSting): void {
    if (this.disposed || !this.context || !this.master || !ghibliSoundEnabled()) return;
    if (!ghibliMusicEnabled()) {
      this.play(STING_FALLBACK[name]);
      return;
    }
    const now = performance.now();
    if (now - this.lastSting < STING_ANY_GAP_MS) return;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < STING_GAP_MS) return;
    this.lastSting = now;
    this.lastPlayed.set(name, now);
    const context = this.context;
    const master = this.master;
    void this.load(name).then((buffer) => {
      if (!buffer || this.disposed || !ghibliSoundEnabled() || !ghibliMusicEnabled()) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = STING_VOLUME;
      source.connect(gain).connect(master);
      this.sources.add(source);
      this.stingDuck = 0.2;
      this.rampMusic();
      window.clearTimeout(this.stingTimer);
      this.stingTimer = window.setTimeout(
        () => {
          this.stingDuck = 1;
          this.rampMusic();
        },
        buffer.duration * 1000 - 600,
      );
      source.addEventListener('ended', () => this.sources.delete(source));
      source.start();
    });
  }

  /** Soft ticks on controls and chart points. The game dialog plays its own sounds. */
  private readonly onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !this.context || target.closest('.ghibli-boiler')) return;
    const control = target.closest(UI_SELECTOR);
    if (control) {
      this.uiTick = (this.uiTick + 1) % 5;
      const role = control.getAttribute('role');
      const name: GhibliSound =
        role === 'switch' || role === 'checkbox'
          ? 'kodama-rattle'
          : control.closest("[data-slot='select-trigger'], [role='option']")
            ? 'soot-rustle'
            : 'chime';
      // A pentatonic step per click so repeated clicks sound like a small tune.
      const rate = [1, 1.125, 1.25, 1.5, 1.68][this.uiTick] * (name === 'chime' ? 1.5 : 1.2);
      this.play(name, { volume: name === 'chime' ? 0.1 : 0.16, rate, gap: 90 });
      return;
    }
    if (target.closest(CHART_SELECTOR)) this.play('chime', { volume: 0.12, rate: 2, gap: 160 });
  };

  private readonly onHover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !this.context) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(HOVER_SELECTOR);
    if (!control || control.closest('.ghibli-boiler')) return;
    const from = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (from && control.contains(from)) return;
    this.play('soot-rustle', { volume: 0.05, rate: 1.8, gap: 450 });
  };

  private readonly saveMeadow = () => {
    const context = this.context;
    const buffer = this.musicSource?.buffer;
    if (!context || !buffer) return;
    const at = (this.musicOffset + context.currentTime - this.musicStartedAt) % buffer.duration;
    try {
      sessionStorage.setItem(MEADOW_AT_KEY, at.toFixed(2));
    } catch {}
  };

  private readonly onGesture = () => {
    if (this.disposed) return;
    if (!this.context) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      try {
        this.context = new Context();
      } catch {
        return;
      }
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    this.syncMusic();
  };

  private load(name: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const context = this.context;
    if (!context) return Promise.resolve(null);
    const pending = fetch(asset(`audio/${name}.mp3`))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(name))))
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
    this.buffers.set(name, pending);
    return pending;
  }

  play(name: GhibliSound, options: PlayOptions = {}): void {
    if (this.disposed || !this.context || !this.master || !ghibliSoundEnabled()) return;
    const now = performance.now();
    const gap = options.gap ?? DEFAULT_GAP[name];
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < gap) return;
    if (now - this.lastAny < GLOBAL_GAP_MS) return;
    this.lastPlayed.set(name, now);
    this.lastAny = now;
    const context = this.context;
    const master = this.master;
    void this.load(name).then((buffer) => {
      if (!buffer || this.disposed || !ghibliSoundEnabled()) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.rate ?? 1;
      const gain = context.createGain();
      gain.gain.value = options.volume ?? 0.5;
      source.connect(gain).connect(master);
      this.sources.add(source);
      source.addEventListener('ended', () => this.sources.delete(source));
      source.start();
    });
  }

  private readonly syncSound = () => {
    if (ghibliSoundEnabled()) return;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
  };

  private readonly syncMusic = () => {
    if (this.disposed) return;
    if (!ghibliMusicEnabled()) {
      this.stopMusic();
      return;
    }
    if (!this.context || !this.master || this.musicSource || this.musicStarting) return;
    this.musicStarting = true;
    const context = this.context;
    const master = this.master;
    void this.load(MUSIC_TRACK).then((buffer) => {
      this.musicStarting = false;
      if (!buffer || this.disposed || this.musicSource || !ghibliMusicEnabled()) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(
        MUSIC_VOLUME * this.duckLevel * this.stingDuck,
        context.currentTime + 4,
      );
      source.connect(gain).connect(master);
      // Resume where the last page left off, so navigation doesn't restart the music.
      const offset = readMeadowOffset() % buffer.duration;
      source.start(0, offset);
      this.musicOffset = offset;
      this.musicStartedAt = context.currentTime;
      this.musicSource = source;
      this.musicGain = gain;
      this.onMusicStart?.();
    });
  };

  private stopMusic(): void {
    this.saveMeadow();
    try {
      this.musicSource?.stop();
    } catch {}
    this.musicSource?.disconnect();
    this.musicGain?.disconnect();
    this.musicSource = null;
    this.musicGain = null;
  }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.stingTimer);
    window.removeEventListener('pointerdown', this.onGesture, true);
    window.removeEventListener('keydown', this.onGesture, true);
    window.removeEventListener(GHIBLI_MUSIC_EVENT, this.syncMusic);
    window.removeEventListener(GHIBLI_SOUND_EVENT, this.syncSound);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('pointerover', this.onHover, true);
    window.removeEventListener('pagehide', this.saveMeadow);
    this.stopMusic();
    this.syncSound();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.buffers.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
