import { SOUND_VARIANTS, type SoundKey } from './mc-atlas';

const SOUND_BASE = '/decorative/minecraft/game/sounds/';

/** File URL for one variant of a sound key (variant 0 when the key has a single file). */
export function soundUrl(key: SoundKey, variant: number) {
  const name = key.replaceAll('/', '-');
  return `${SOUND_BASE}${name}${SOUND_VARIANTS[key] ? variant + 1 : ''}.mp3`;
}

export function soundEnabled() {
  try {
    return localStorage.getItem('minecraft-sound') !== 'false';
  } catch {
    return true;
  }
}

/** Web Audio playback of the vanilla sound effects with distance attenuation. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  enabled = soundEnabled();
  volume = 0.8;

  private context() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Resume after a user gesture (browsers start contexts suspended). */
  resume() {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private load(url: string) {
    const ctx = this.context();
    if (!ctx) return Promise.resolve(null);
    let p = this.loading.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null)
        .then((buffer) => {
          this.buffers.set(url, buffer);
          return buffer;
        });
      this.loading.set(url, p);
    }
    return p;
  }

  /** Warm the cache for frequently used sounds. */
  preload(keys: SoundKey[]) {
    for (const key of keys) {
      const n = Math.max(1, SOUND_VARIANTS[key]);
      for (let i = 0; i < n; i++) void this.load(soundUrl(key, i));
    }
  }

  /**
   * Play a sound at a world position relative to the listener.
   * Volume falls off linearly over 16 blocks per unit of volume, like vanilla.
   */
  play(key: SoundKey, volume = 1, pitch = 1, distance = 0) {
    if (!this.enabled) return;
    const range = 16 * Math.max(1, volume);
    if (distance > range) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const variants = Math.max(1, SOUND_VARIANTS[key]);
    const url = soundUrl(key, Math.floor(Math.random() * variants));
    const gainValue = Math.min(1, volume) * (1 - distance / range);
    const start = (buffer: AudioBuffer | null) => {
      if (!buffer || !this.master || !this.ctx) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
      const gain = this.ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(this.master);
      source.start();
    };
    const cached = this.buffers.get(url);
    if (cached === undefined) {
      void this.load(url).then(start);
    } else {
      start(cached);
    }
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
    this.loading.clear();
  }
}
