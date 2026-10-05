import type { Race } from './kart-engine';

/**
 * Original synthesized sound effects (no Nintendo audio): engine drone that
 * follows speed, drift squeal, boost whoosh, countdown beeps, and item cues.
 */
export function createKartAudio() {
  const Ctx =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  const master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  // Engine: two detuned saws through a low-pass.
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  filter.connect(engineGain);
  engineGain.connect(master);
  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscB.type = 'square';
  oscA.connect(filter);
  const subGain = ctx.createGain();
  subGain.gain.value = 0.35;
  oscB.connect(subGain);
  subGain.connect(filter);
  oscA.start();
  oscB.start();
  // Drift squeal: filtered noise.
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const squealFilter = ctx.createBiquadFilter();
  squealFilter.type = 'bandpass';
  squealFilter.frequency.value = 2400;
  squealFilter.Q.value = 6;
  const squeal = ctx.createGain();
  squeal.gain.value = 0;
  noise.connect(squealFilter);
  squealFilter.connect(squeal);
  squeal.connect(master);
  noise.start();
  let muted = false;

  const tone = (
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.25,
    slide = 0,
  ) => {
    if (muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const burst = (dur: number, freq: number, vol = 0.3) => {
    if (muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur);
  };
  let rouletteTick = 0;

  return {
    resume() {
      void ctx.resume();
    },
    setMuted(value: boolean) {
      muted = value;
      master.gain.setTargetAtTime(value ? 0 : 0.32, ctx.currentTime, 0.05);
    },
    update(race: Race, dt: number, active: boolean) {
      const k = race.player;
      const t = ctx.currentTime;
      const speed = Math.max(0, Math.abs(k.speed));
      const on = active && !muted && race.phase !== 'paused';
      const base = 55 + speed * 2.1 + (k.boost > 0 ? 40 : 0);
      oscA.frequency.setTargetAtTime(base, t, 0.06);
      oscB.frequency.setTargetAtTime(base * 0.5 + 3, t, 0.06);
      filter.frequency.setTargetAtTime(500 + speed * 22 + (k.boost > 0 ? 900 : 0), t, 0.08);
      engineGain.gain.setTargetAtTime(on ? 0.16 + Math.min(0.12, speed / 500) : 0, t, 0.1);
      const drifting = on && k.driftDir !== 0 && k.grounded;
      squealFilter.frequency.setTargetAtTime(
        k.driftStage === 2 ? 3200 : k.driftStage === 1 ? 2700 : 2200,
        t,
        0.05,
      );
      squeal.gain.setTargetAtTime(drifting ? 0.07 : 0, t, 0.05);
      if (k.roulette > 0 && on) {
        rouletteTick -= dt;
        if (rouletteTick <= 0) {
          tone(1200 + Math.random() * 400, 0.04, 'square', 0.06);
          rouletteTick = 0.07;
        }
      }
      if (!active) return;
      for (const e of race.events) {
        const mine = e.kart === k.index;
        switch (e.type) {
          case 'countdown': {
            tone(440, 0.25, 'square', 0.18);
            break;
          }
          case 'go': {
            tone(880, 0.6, 'square', 0.2);
            break;
          }
          case 'rocket-start': {
            if (mine) burst(0.6, 3000, 0.25);
            break;
          }
          case 'burnout': {
            if (mine) tone(120, 0.6, 'sawtooth', 0.2, -60);
            break;
          }
          case 'item-box': {
            if (mine) tone(1500, 0.18, 'triangle', 0.18, 600);
            break;
          }
          case 'item-ready': {
            if (mine) tone(990, 0.15, 'triangle', 0.18);
            break;
          }
          case 'item-use': {
            if (mine) tone(600, 0.12, 'square', 0.1, 300);
            break;
          }
          case 'boost':
          case 'mini-turbo': {
            if (mine) burst(0.5, 4000, 0.22);
            break;
          }
          case 'spin': {
            if (mine) tone(700, 0.5, 'triangle', 0.18, -500);
            break;
          }
          case 'hit': {
            if (mine) {
              burst(0.4, 1500, 0.35);
              tone(300, 0.4, 'sawtooth', 0.15, -200);
            }
            break;
          }
          case 'wall': {
            if (mine) burst(0.12, 900, Math.min(0.3, (e.value ?? 20) / 120));
            break;
          }
          case 'explosion': {
            burst(0.9, 1200, 0.4);
            break;
          }
          case 'lightning': {
            burst(0.8, 6000, 0.35);
            break;
          }
          case 'lap': {
            if (mine) tone(660, 0.2, 'triangle', 0.2);
            break;
          }
          case 'final-lap': {
            if (mine) {
              tone(660, 0.15, 'square', 0.18);
              setTimeout(() => tone(880, 0.3, 'square', 0.18), 160);
            }
            break;
          }
          case 'finish': {
            if (mine)
              [523, 659, 784, 1046].forEach((f, i) =>
                setTimeout(() => tone(f, 0.35, 'square', 0.16), i * 150),
              );
            break;
          }
          case 'respawn': {
            if (mine) tone(500, 0.3, 'triangle', 0.14, 300);
            break;
          }
        }
      }
    },
    dispose() {
      try {
        oscA.stop();
        oscB.stop();
        noise.stop();
      } catch {
        // already stopped
      }
      void ctx.close();
    },
  };
}
export type KartAudio = NonNullable<ReturnType<typeof createKartAudio>>;
