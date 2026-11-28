/** Original procedural music; no tune is taken from a show or recording. */
import { enabled } from './preferences';
export type Cue = 'snip' | 'rustle' | 'crunch' | 'dispatch' | 'shop' | 'miss' | 'wave';
export function paperSynth(game = false) {
  let ctx: AudioContext | null = null,
    music: GainNode | null = null,
    fx: GainNode | null = null,
    beat = 0,
    last = 0,
    loop = 0;
  let active = false,
    duckUntil = 0,
    disposed = false;
  const voices = new Set<OscillatorNode>();
  let heat = 0,
    combo = 0,
    chapter = 1,
    lastPulse = 0;
  const key = `south-park-${game ? 'dispatch' : 'town'}-beat`;
  try {
    beat = Number(sessionStorage.getItem(key)) % 32 || 0;
  } catch {}
  function connect() {
    if (!active || disposed || document.hidden || (!enabled('sound') && !enabled('music')))
      return false;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        music = ctx.createGain();
        fx = ctx.createGain();
        music.gain.value = 0.09;
        fx.gain.value = 0.12;
        music.connect(ctx.destination);
        fx.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  function tone(
    bus: GainNode | null,
    hz: number,
    dur: number,
    volume: number,
    wave: OscillatorType,
    slide = 1,
    delay = 0,
  ) {
    if (!ctx || !bus || voices.size > 16) return;
    const now = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(hz, now);
    o.frequency.exponentialRampToValueAtTime(hz * slide, now + dur);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g);
    g.connect(bus);
    voices.add(o);
    o.addEventListener(
      'ended',
      () => {
        voices.delete(o);
        o.disconnect();
        g.disconnect();
      },
      { once: true },
    );
    o.start(now);
    o.stop(now + dur + 0.01);
  }
  function pulse() {
    if (!active || !enabled('music') || document.hidden || !connect()) return;
    const now = performance.now();
    if (game && now - lastPulse < Math.max(160, 330 - heat * 1.35 - combo * 3)) return;
    lastPulse = now;
    const bass = (
      game
        ? [146.8, 196, 164.8, 220]
        : chapter === 2
          ? [98, 130.8, 116.5, 146.8]
          : chapter === 3
            ? [164.8, 220, 196, 246.9]
            : chapter === 4
              ? [174.6, 220, 196, 261.6]
              : chapter === 5
                ? [110, 146.8, 130.8, 164.8]
                : [130.8, 174.6, 146.8, 196]
    )[Math.floor(beat / 8) % 4];
    if (beat % 4 === 0)
      tone(music, bass * (game && chapter % 5 === 0 ? 0.75 : 1), 0.32, 0.36, 'triangle', 0.991);
    if (game && heat > 72 && beat % 4 === 3) tone(music, 196 + heat, 0.09, 0.19, 'square', 0.76);
    if ([1, 4, 6].includes(beat % 8))
      tone(
        music,
        bass * [2, 2.5, 3, 2.25][Math.floor(beat / 2) % 4],
        0.14,
        0.23,
        'triangle',
        0.985,
      );
    if (beat % 4 === 2) tone(music, 83, 0.07, 0.18, 'square', 0.52);
    beat = (beat + 1) % 32;
    if (beat % 4 === 0)
      try {
        sessionStorage.setItem(key, String(beat));
      } catch {}
    if (ctx && music)
      music.gain.setTargetAtTime(
        performance.now() < duckUntil ? 0.024 : 0.09,
        ctx.currentTime,
        0.07,
      );
  }
  function sync() {
    clearInterval(loop);
    loop = 0;
    if (!active || document.hidden || disposed) {
      if (ctx) void ctx.suspend().catch(() => {});
      return;
    }
    if (ctx && music && fx) {
      music.gain.value = enabled('music') ? 0.09 : 0;
      fx.gain.value = enabled('sound') ? 0.12 : 0;
    }
    if (enabled('music') && connect()) loop = window.setInterval(pulse, game ? 40 : 370);
  }
  return {
    drive(load: number, chain: number, zone: number) {
      heat = load;
      combo = chain;
      chapter = zone;
    },
    activate() {
      if (!active) {
        active = true;
        sync();
      }
    },
    pause() {
      active = false;
      sync();
    },
    sync,
    duck() {
      duckUntil = performance.now() + 2300;
      if (ctx && music) music.gain.setTargetAtTime(0.023, ctx.currentTime, 0.025);
    },
    cue(id: Cue) {
      if (!active || !enabled('sound') || performance.now() - last < 90 || !connect()) return;
      last = performance.now();
      if (id === 'wave' || id === 'shop') {
        tone(fx, 390, 0.12, 0.4, 'triangle');
        tone(fx, 585, 0.18, 0.35, 'triangle', 1, 0.08);
      } else if (id === 'miss') tone(fx, 155, 0.2, 0.48, 'sawtooth', 0.46);
      else if (id === 'dispatch')
        tone(fx, 325 + Math.min(8, combo) * 31 + heat * 0.5, 0.12, 0.42, 'triangle', 1.55);
      else
        tone(
          fx,
          id === 'snip' ? 1320 : id === 'rustle' ? 510 : 145,
          id === 'rustle' ? 0.045 : 0.065,
          0.24,
          'triangle',
          0.35,
        );
    },
    dispose() {
      disposed = true;
      active = false;
      clearInterval(loop);
      for (const o of voices)
        try {
          o.stop();
        } catch {}
      voices.clear();
      if (ctx) void ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
