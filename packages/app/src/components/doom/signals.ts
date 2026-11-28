// The site plays archived cues only after arm(); the cartridge retains its reactive score.
export type Cue =
  | 'door'
  | 'tick'
  | 'secret'
  | 'pulse'
  | 'burst'
  | 'plasma'
  | 'nova'
  | 'hurt'
  | 'card'
  | 'vent'
  | 'alarm'
  | 'clear';
const palette: Record<Cue, [number, number, number, OscillatorType]> = {
  door: [138, 38, 0.23, 'sawtooth'],
  tick: [480, 285, 0.045, 'square'],
  secret: [430, 1090, 0.28, 'triangle'],
  pulse: [160, 40, 0.18, 'triangle'],
  burst: [220, 46, 0.13, 'square'],
  plasma: [600, 165, 0.16, 'sawtooth'],
  nova: [92, 25, 0.6, 'sawtooth'],
  hurt: [195, 51, 0.32, 'sawtooth'],
  card: [587, 880, 0.18, 'sine'],
  vent: [610, 122, 0.31, 'triangle'],
  alarm: [310, 465, 0.15, 'square'],
  clear: [392, 784, 0.45, 'triangle'],
};
const records = ['gate', 'tower', 'division', 'complex'] as const;
type RecordId = (typeof records)[number];
export function mixer(cursor = 'doom-beat') {
  let recording: HTMLAudioElement | null = null,
    side: RecordId = 'gate';
  const effects = new Set<HTMLAudioElement>();
  const silenceEffects = () => {
    for (const e of effects) e.pause();
    effects.clear();
  };
  const cartridge = cursor === 'doom-game-beat';
  // A route may unmount the station. Keep the last track and playhead only.
  // A new document always waits for a gesture before starting audio.
  try {
    const last = sessionStorage.getItem('doom-record') as RecordId;
    if (records.includes(last)) side = last;
  } catch {
    /* optional */
  }
  const remember = () => {
    if (cartridge || !recording || recording.readyState < 1) return;
    try {
      sessionStorage.setItem(`doom-head-${side}`, String(recording.currentTime));
    } catch {
      /* optional */
    }
  };
  if (!cartridge) window.addEventListener('pagehide', remember);
  function riff() {
    if (!ac || !playing || document.hidden || !score || cartridge) return;
    if (!recording) {
      const rec = new Audio(`/decorative/doom/${side}.ogg`);
      recording = rec;
      rec.loop = true;
      rec.volume = 0.13;
      try {
        const head = Number(sessionStorage.getItem(`doom-head-${side}`));
        if (Number.isFinite(head) && head > 0)
          rec.addEventListener(
            'loadedmetadata',
            () => {
              if (Number.isFinite(rec.duration) && rec.duration > 0)
                rec.currentTime = head % rec.duration;
            },
            { once: true },
          );
      } catch {
        /* optional */
      }
    }
    if (recording.paused) void recording.play().catch(() => {});
  }
  let ac: AudioContext | null = null,
    music: GainNode | null = null,
    sfx: GainNode | null = null,
    filter: BiquadFilterNode | null = null,
    clock = 0,
    beat = 0,
    next = 0,
    heat = 0,
    threat = 0,
    zone = 0,
    playing = false,
    inside = false,
    disposed = false;
  let score = true,
    fx = true;
  try {
    score =
      (localStorage.getItem('doom-audio') ??
        (localStorage.getItem('doom-music') === 'false' ||
        localStorage.getItem('doom-sound') === 'false'
          ? 'false'
          : 'true')) !== 'false';
    fx = score;
    beat = Number(sessionStorage.getItem(cursor) || 0) % 32;
  } catch {
    /* optional */
  }
  function tone(
    bus: AudioNode,
    a: number,
    b: number,
    len: number,
    wave: OscillatorType,
    vol: number,
    t: number,
  ) {
    if (!ac) return;
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(a, t);
    o.frequency.exponentialRampToValueAtTime(b, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    g.connect(bus);
    o.addEventListener(
      'ended',
      () => {
        o.disconnect();
        g.disconnect();
      },
      { once: true },
    );
    o.start(t);
    o.stop(t + len + 0.02);
  }
  function cycle() {
    if (
      !cartridge ||
      !ac ||
      !filter ||
      ac.state !== 'running' ||
      !score ||
      document.hidden ||
      !playing
    )
      return;
    const t = ac.currentTime;
    if (next < t) next = t;
    while (next < t + 0.11) {
      const k = beat % 16,
        n = (inside ? [0, 3, 0, -2, 7, 0, 5, -2] : [0, 0, 3, 0, 5, 3, 0, -2])[Math.floor(k / 2)],
        root = (inside ? 68 : 53) * 2 ** ((n + (zone % 3)) / 12);
      if (k % 2 === 0 || threat > 0.55)
        tone(filter, root * 1.02, root, k % 4 === 0 ? 0.17 : 0.085, 'sawtooth', 0.085, next);
      if (k === 4 || k === 12) tone(filter, 160, 38, 0.09, 'triangle', 0.14, next);
      if (inside && k % 4 === 2) tone(filter, 1250, 390, 0.045, 'square', 0.018, next);
      if (k === 14) tone(filter, root * 3, root * 2, 0.22, 'triangle', 0.07, next);
      beat = (beat + 1) % 32;
      next += 60 / (inside ? 118 + heat * 0.42 + threat * 24 : 90) / 4;
    }
    filter.frequency.setTargetAtTime(inside ? 550 + heat * 12 + threat * 400 : 450, t, 0.08);
  }
  function arm() {
    if (disposed || (!score && !fx)) return;
    playing = true;
    if (!ac)
      try {
        ac = new AudioContext();
        music = ac.createGain();
        sfx = ac.createGain();
        filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.connect(music);
        music.gain.value = 0.24;
        sfx.gain.value = 0.42;
        music.connect(ac.destination);
        sfx.connect(ac.destination);
        clock = window.setInterval(cycle, 55);
      } catch {
        return;
      }
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    riff();
  }
  function cue(id: Cue) {
    if (!playing || !fx || !ac || !sfx || document.hidden) return;
    const clip = (
      {
        door: 'door',
        burst: 'report',
        alarm: 'growl',
        card: 'pickup',
        secret: 'pickup',
        tick: 'switch',
      } as Partial<Record<Cue, string>>
    )[id];
    if (clip) {
      // A shot and a pickup can land on the very same simulation step. Do not
      // interrupt an unstarted report with the next cue; bound the available voices.
      if (effects.size >= 4) {
        const oldest = effects.values().next().value;
        if (oldest) {
          oldest.pause();
          effects.delete(oldest);
        }
      }
      const effect = new Audio(`/decorative/doom/${clip}.ogg`);
      effects.add(effect);
      const release = () => effects.delete(effect);
      effect.addEventListener('ended', release, { once: true });
      effect.volume = cartridge ? 0.3 : 0.2;
      void effect.play().catch(release);
      return;
    }
    const [a, b, len, w] = palette[id],
      t = ac.currentTime;
    tone(sfx, a, b, len, w, 0.12, t);
    if (id === 'secret' || id === 'clear')
      tone(sfx, a * 1.5, b * 1.25, 0.28, 'triangle', 0.12, t + 0.12);
    music?.gain.cancelScheduledValues(t);
    music?.gain.setTargetAtTime(0.08, t, 0.012);
    music?.gain.setTargetAtTime(0.24, t + 0.19, 0.12);
  }
  return {
    arm,
    riff,
    cue,
    station(id: RecordId) {
      if (id !== side) {
        remember();
        recording?.pause();
        recording = null;
        side = id;
        try {
          sessionStorage.setItem('doom-record', id);
        } catch {
          /* optional */
        }
      }
      riff();
    },
    flags: () => [score, fx],
    sync() {
      try {
        const flag = localStorage.getItem('doom-audio');
        if (flag !== null) {
          score = flag === 'true';
          fx = score;
        }
        if (!score) recording?.pause();
        if (!fx) silenceEffects();
        if (ac && music && sfx) {
          music.gain.cancelScheduledValues(ac.currentTime);
          music.gain.value = score ? 0.24 : 0;
          sfx.gain.value = fx ? 0.42 : 0;
        }
      } catch {
        /* optional storage */
      }
    },
    switch() {
      score = !score;
      fx = score;
      try {
        localStorage.setItem('doom-audio', String(score));
      } catch {
        /* optional */
      }
      this.sync();
      if (score) arm();
      if (fx) cue('tick');
      window.dispatchEvent(new Event('doom-mix'));
    },
    game(on: boolean, h = 0, a = 0, z = 0) {
      inside = on;
      heat = h;
      threat = a;
      zone = z;
    },
    sleep() {
      playing = false;
      recording?.pause();
      remember();
      silenceEffects();
    },
    close() {
      disposed = true;
      recording?.pause();
      remember();
      window.removeEventListener('pagehide', remember);
      silenceEffects();
      clearInterval(clock);
      try {
        sessionStorage.setItem(cursor, String(beat));
      } catch {
        /* optional */
      }
      if (ac) void ac.close().catch(() => {});
    },
  };
}
export type Mixer = ReturnType<typeof mixer>;
