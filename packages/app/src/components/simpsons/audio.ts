export type Channel = 'music' | 'sound';
const fallback = { music: true, sound: true };
let fallbackMuted = false;
export function isMuted() {
  try {
    return localStorage.getItem('simpsons-master-muted') === 'true';
  } catch {
    return fallbackMuted;
  }
}
export function muteAll(muted: boolean) {
  fallbackMuted = muted;
  try {
    localStorage.setItem('simpsons-master-muted', String(muted));
  } catch {
    /* private storage */
  }
  for (const channel of ['sound', 'music'])
    window.dispatchEvent(new Event(`simpsons-${channel}-toggle`));
}
export function enabled(channel: Channel) {
  if (isMuted()) return false;
  try {
    return localStorage.getItem(`simpsons-${channel}`) !== 'false';
  } catch {
    return fallback[channel];
  }
}
export function setEnabled(channel: Channel, value: boolean) {
  fallback[channel] = value;
  try {
    localStorage.setItem(`simpsons-${channel}`, String(value));
  } catch {
    // Private browsing and storage policies may disable persistence.
  }
  window.dispatchEvent(new CustomEvent(`simpsons-${channel}-toggle`));
}

export function broadcastAudio() {
  let unlocked = false;
  let last = -Infinity;
  let ctx: AudioContext | null = null,
    musicBus: GainNode | null = null,
    sfxBus: GainNode | null = null;
  let rink = false,
    lastUi = -Infinity;
  const notes = new Set<OscillatorNode>();
  const voices = new Map<Channel, HTMLAudioElement>();
  const handlers = new Map<Channel, () => void>();
  const init = () => {
    if (!ctx)
      try {
        ctx = new AudioContext();
        musicBus = ctx.createGain();
        sfxBus = ctx.createGain();
        musicBus.connect(ctx.destination);
        sfxBus.connect(ctx.destination);
      } catch {
        return;
      }
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
  };
  const note = (
    freq: number,
    vol: number,
    len: number,
    type: OscillatorType,
    bus: GainNode | null,
  ) => {
    if (!ctx || ctx.state !== 'running' || !bus) return;
    const osc = ctx.createOscillator(),
      env = ctx.createGain(),
      at = ctx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(env).connect(bus);
    osc.start();
    osc.stop(at + len + 0.01);
    notes.add(osc);
    osc.addEventListener(
      'ended',
      () => {
        notes.delete(osc);
        osc.disconnect();
        env.disconnect();
      },
      { once: true },
    );
  };
  const mix = () => {
    const duck = voices.has('sound');
    const song = voices.get('music');
    if (song) song.volume = duck ? 0.045 : 0.17;
    if (musicBus && ctx)
      musicBus.gain.setTargetAtTime(
        !enabled('music') || rink || document.hidden
          ? 0
          : duck || song?.paused === false
            ? 0.19
            : 0.8,
        ctx.currentTime,
        0.09,
      );
    if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(enabled('sound') ? 1 : 0, ctx.currentTime, 0.01);
  };
  const stop = (kind: Channel) => {
    const voice = voices.get(kind);
    if (!voice) return;
    const ended = handlers.get(kind);
    if (ended) voice.removeEventListener('ended', ended);
    handlers.delete(kind);
    voice.pause();
    voice.removeAttribute('src');
    voice.load();
    voices.delete(kind);
    mix();
  };
  const hush = () => {
    stop('sound');
    stop('music');
  };
  const play = (clip: string, kind: Channel = 'sound') => {
    if (!unlocked || document.hidden || !enabled(kind)) return;
    if (kind === 'sound') {
      if (performance.now() - last < 600) return;
      last = performance.now();
    }
    stop(kind);
    const ogg = ['opening-loop', 'aurora', 'pacifier'].includes(clip);
    const voice = new Audio(`/decorative/simpsons/audio/${clip}.${ogg ? 'ogg' : 'mp3'}`);
    voice.loop = clip === 'opening-loop';
    voice.volume = kind === 'music' ? 0.17 : 0.28;
    voices.set(kind, voice);
    mix();
    const ended = () => {
      if (voices.get(kind) === voice) stop(kind);
    };
    voice.addEventListener('ended', ended, { once: true });
    handlers.set(kind, ended);
    void voice.play().catch(() => {
      if (voices.get(kind) === voice) stop(kind);
    });
  };
  const radio = () => {
    if (!rink && !document.hidden && enabled('music')) play('opening-loop', 'music');
  };
  const gesture = (event: Event) => {
    if (!event.isTrusted || unlocked) return;
    unlocked = true;
    init();
    radio();
  };
  const music = () => {
    if (!enabled('music')) stop('music');
    radio();
  };
  const sound = () => {
    if (!enabled('sound')) stop('sound');
    mix();
  };
  const visibility = () => {
    if (document.hidden) hush();
    else radio();
  };
  const ui = (e: Event) => {
    if (
      !unlocked ||
      rink ||
      document.hidden ||
      !enabled('sound') ||
      !(e.target instanceof Element) ||
      !e.isTrusted
    )
      return;
    const el = e.target.closest(
      'button,[role="tab"],[data-testid="d3-chart-svg"],select,[role="switch"]',
    );
    if (!el || el.closest('[data-simpsons-control]')) return;
    const hover = e.type === 'pointerover';
    if (
      hover &&
      (!matchMedia('(hover:hover)').matches ||
        (e instanceof PointerEvent &&
          e.relatedTarget instanceof Node &&
          el.contains(e.relatedTarget)))
    )
      return;
    const now = performance.now();
    if (now - lastUi < (hover ? 550 : 65)) return;
    lastUi = now;
    note(
      hover ? 540 : el.matches('svg') ? 610 : 790,
      hover ? 0.008 : 0.028,
      hover ? 0.035 : 0.064,
      'triangle',
      sfxBus,
    );
  };
  const game = (e: Event) => {
    rink = Boolean((e as CustomEvent).detail);
    if (rink) hush();
    radio();
  };
  const gameClip = (e: Event) => {
    const name = (e as CustomEvent).detail;
    if (
      rink &&
      typeof name === 'string' &&
      ['sax', 'donuts', 'doh', 'ha-ha', 'ay-caramba'].includes(name)
    )
      play(name);
  };
  const silence = () => stop('sound');
  window.addEventListener('click', ui, true);
  window.addEventListener('pointerover', ui, true);
  window.addEventListener('simpsons-rink-open', game);
  window.addEventListener('simpsons-rink-sfx', gameClip);
  window.addEventListener('simpsons-rink-silence', silence);
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);
  window.addEventListener('simpsons-music-toggle', music);
  window.addEventListener('simpsons-sound-toggle', sound);
  document.addEventListener('visibilitychange', visibility);
  return {
    play,
    dispose() {
      window.removeEventListener('pointerdown', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('simpsons-music-toggle', music);
      window.removeEventListener('simpsons-sound-toggle', sound);
      document.removeEventListener('visibilitychange', visibility);
      hush();
      window.removeEventListener('click', ui, true);
      window.removeEventListener('pointerover', ui, true);
      window.removeEventListener('simpsons-rink-open', game);
      window.removeEventListener('simpsons-rink-sfx', gameClip);
      window.removeEventListener('simpsons-rink-silence', silence);
      for (const osc of notes)
        try {
          osc.stop();
        } catch {
          /* ended */
        }
      if (ctx) void ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
