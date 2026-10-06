import type { Controls, Kart, Race } from './kart-engine';
import { SURFACE } from './kart-surface';

/**
 * Race audio. Music, sound effects, and engine loops are Mario Kart Wii
 * samples (see public/decorative/kart/README.md for provenance). The engine
 * is built from the game's kart idle/run loops, pitched by speed, filtered by
 * throttle load, with every CPU kart audible in stereo with distance falloff
 * and Doppler. Until the samples finish decoding, or if they fail to load,
 * the original synthesized cues are used instead.
 */
export const KART_AUDIO_BASE = '/decorative/kart/audio/';
const LOOPS = ['engine', 'engine-idle', 'drift', 'offroad'] as const;
const SHOTS = [
  'countdown',
  'go',
  'lap',
  'lap-final',
  'goal',
  'pause-on',
  'pause-off',
  'item-box',
  'roulette',
  'item-decide',
  'item-equip',
  'shell-green',
  'shell-red',
  'shell-hit',
  'banana',
  'explosion',
  'lightning',
  'star',
  'star-hit',
  'dash',
  'slipstream',
  'spark-blue',
  'spark-orange',
  'spin',
  'start-fail',
  'wall',
  'bump',
  'hop',
  'water',
  'rev',
] as const;
const MUSIC = [
  'music-start',
  'music-race',
  'music-race-final',
  'jingle-final-lap',
  'jingle-1st',
  'jingle-podium',
  'jingle-low',
] as const;
export type KartSample = (typeof LOOPS)[number] | (typeof SHOTS)[number] | (typeof MUSIC)[number];
export const KART_SAMPLES: readonly KartSample[] = [...LOOPS, ...SHOTS, ...MUSIC];
export const kartSampleUrl = (name: KartSample) =>
  `${KART_AUDIO_BASE}${name}.${(LOOPS as readonly string[]).includes(name) ? 'wav' : 'mp3'}`;
/** Seamless loop regions (seconds) measured on the shipped music files. */
export const MUSIC_LOOPS: Partial<Record<KartSample, [number, number]>> = {
  'music-race': [8, 65.59990625],
  'music-race-final': [8, 56.30628125],
};
const MASTER = 0.42;
const MUSIC_LEVEL = 0.34;
/** Engine pitch for a kart at `ratio` of its top speed (1 = recorded pitch). */
export function enginePitch(ratio: number, boosting: boolean, throttle: boolean) {
  const r = Math.max(0, Math.min(1.35, ratio));
  return 0.58 + r * 0.72 + (boosting ? 0.1 : 0) + (throttle ? 0.04 : -0.03);
}

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
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);
  const musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_LEVEL;
  musicBus.connect(master);

  // Synthesized fallback engine: two detuned oscillators through a low-pass.
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  filter.connect(engineGain);
  engineGain.connect(sfxBus);
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
  // Synthesized fallback drift squeal: filtered noise.
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
  squeal.connect(sfxBus);
  noise.start();

  let muted = false;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) callback();
    }, delay);
    timers.add(timer);
  };
  const sources = new Set<AudioScheduledSourceNode>();
  const track = <T extends AudioScheduledSourceNode>(node: T) => {
    sources.add(node);
    node.addEventListener?.('ended', () => sources.delete(node));
    return node;
  };

  const tone = (
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.25,
    slide = 0,
  ) => {
    if (muted || disposed) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const burst = (dur: number, freq: number, vol = 0.3) => {
    if (muted || disposed) return;
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
    g.connect(sfxBus);
    src.start(t);
    src.stop(t + dur);
  };

  // Game samples.
  const buffers = new Map<KartSample, AudioBuffer>();
  let ready = false;
  const load = async (name: KartSample) => {
    const res = await fetch(kartSampleUrl(name));
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const bytes = await res.arrayBuffer();
    if (disposed) return;
    buffers.set(name, await ctx.decodeAudioData(bytes));
  };
  if (typeof fetch === 'function' && typeof ctx.decodeAudioData === 'function') {
    void Promise.all(KART_SAMPLES.map((name) => load(name).catch(() => {}))).then(() => {
      if (disposed) return;
      ready = LOOPS.every((n) => buffers.has(n));
      if (ready) startLoops();
    });
  }
  const play = (name: KartSample, vol = 1, rate = 1, pan = 0) => {
    const buffer = buffers.get(name);
    if (!buffer || muted || disposed) return Boolean(buffer);
    const src = track(ctx.createBufferSource());
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(sfxBus);
    } else g.connect(sfxBus);
    src.start();
    return true;
  };

  // Music: one track at a time, with seamless loop points for the race theme.
  let music: AudioBufferSourceNode | null = null;
  let musicName: KartSample | null = null;
  const stopMusic = () => {
    if (!music) return;
    try {
      music.stop();
    } catch {
      // already stopped
    }
    music = null;
    musicName = null;
  };
  const playMusic = (name: KartSample, loop: boolean) => {
    const buffer = buffers.get(name);
    if (!buffer || disposed) return 0;
    stopMusic();
    const src = track(ctx.createBufferSource());
    src.buffer = buffer;
    const region = MUSIC_LOOPS[name];
    if (loop) {
      src.loop = true;
      if (region) {
        src.loopStart = region[0];
        src.loopEnd = Math.min(region[1], buffer.duration);
      }
    }
    src.connect(musicBus);
    src.start();
    music = src;
    musicName = name;
    return buffer.duration;
  };
  let finalLap = false;
  let finished = false;
  let gridPlayed = false;
  const resumeFinalTheme = () => {
    if (!finished) playMusic('music-race-final', true);
  };
  const raceTheme = () => (finalLap ? 'music-race-final' : 'music-race');

  // Looping layers: player engine (idle + run), drift, offroad, and rival engines.
  interface Loop {
    src: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
    pan: StereoPannerNode | null;
  }
  const loops: Partial<Record<'run' | 'idle' | 'drift' | 'offroad', Loop>> = {};
  const rivals = new Map<number, Loop>();
  const makeLoop = (name: KartSample, offset = 0): Loop | null => {
    const buffer = buffers.get(name);
    if (!buffer) return null;
    const src = track(ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 8000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(f);
    f.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(sfxBus);
    } else gain.connect(sfxBus);
    src.start(ctx.currentTime, (offset * buffer.duration) % buffer.duration);
    return { src, gain, filter: f, pan };
  };
  function startLoops() {
    loops.run = makeLoop('engine') ?? undefined;
    loops.idle = makeLoop('engine-idle') ?? undefined;
    loops.drift = makeLoop('drift') ?? undefined;
    loops.offroad = makeLoop('offroad') ?? undefined;
    // The samples now carry the engine; retire the synthesized drone.
    engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    squeal.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
  const rivalLoop = (k: Kart) => {
    let loop = rivals.get(k.index);
    if (!loop) {
      const made = makeLoop('engine', (k.index * 0.37) % 1);
      if (!made) return null;
      rivals.set(k.index, made);
      loop = made;
    }
    return loop;
  };

  let rouletteTick = 0;
  let lastStage = 0;
  let lastPhase: Race['phase'] | null = null;
  let lastGrounded = true;
  let lastStar = 0;
  let revCooldown = 0;
  let lastThrottle = false;

  const updateEngines = (race: Race, on: boolean, throttle: boolean) => {
    const t = ctx.currentTime;
    const k = race.player;
    const top = 66;
    const ratio = Math.max(0, Math.abs(k.speed)) / top;
    const boosting = k.boost > 0 || k.star > 0;
    const offroad =
      (k.surface === SURFACE.offroad || k.surface === SURFACE.sand) && k.grounded && !boosting;
    const wobble = offroad ? 1 + Math.sin(t * 37) * 0.02 : 1;
    const pitch = enginePitch(ratio, boosting, throttle) * wobble;
    const idleMix = Math.max(0, 1 - ratio * 3.2);
    if (loops.run) {
      loops.run.src.playbackRate.setTargetAtTime(pitch, t, 0.05);
      // Load: an open throttle sounds brighter and louder than coasting.
      loops.run.filter.frequency.setTargetAtTime(throttle || boosting ? 9000 : 2600, t, 0.08);
      loops.run.gain.gain.setTargetAtTime(
        on ? (1 - idleMix) * (throttle || boosting ? 0.5 : 0.32) : 0,
        t,
        0.06,
      );
    }
    if (loops.idle) {
      loops.idle.src.playbackRate.setTargetAtTime(
        0.92 + ratio * 0.6 + (throttle ? 0.06 : 0),
        t,
        0.05,
      );
      loops.idle.gain.gain.setTargetAtTime(on ? idleMix * 0.45 : 0, t, 0.06);
    }
    if (loops.drift)
      loops.drift.gain.gain.setTargetAtTime(
        on && k.driftDir !== 0 && k.grounded ? 0.38 : 0,
        t,
        0.04,
      );
    if (loops.offroad)
      loops.offroad.gain.gain.setTargetAtTime(on && offroad && ratio > 0.08 ? 0.4 : 0, t, 0.06);
    // Rivals: distance falloff, stereo position, and Doppler around the player.
    const sin = Math.sin(k.heading);
    const cos = Math.cos(k.heading);
    const pvx = sin * k.speed;
    const pvz = cos * k.speed;
    for (const o of race.karts) {
      if (o === k) continue;
      const loop = rivalLoop(o);
      if (!loop) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const dist = Math.hypot(dx, dz) || 1;
      const side = (dx * cos - dz * sin) / dist;
      const ovx = Math.sin(o.heading) * o.speed;
      const ovz = Math.cos(o.heading) * o.speed;
      // Closing speed along the line between the karts, in course units/s.
      const closing = ((ovx - pvx) * -dx + (ovz - pvz) * -dz) / dist;
      const doppler = Math.max(0.8, Math.min(1.25, 1 + closing / 260));
      const level = on && o.respawn <= 0 ? Math.min(0.3, 3.2 / (dist + 6)) : 0;
      const oRatio = Math.max(0, Math.abs(o.speed)) / top;
      loop.src.playbackRate.setTargetAtTime(
        enginePitch(oRatio, o.boost > 0 || o.star > 0, true) * doppler,
        t,
        0.08,
      );
      loop.gain.gain.setTargetAtTime(level, t, 0.08);
      loop.filter.frequency.setTargetAtTime(Math.max(1200, 9000 - dist * 45), t, 0.1);
      loop.pan?.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, -side)), t, 0.08);
    }
  };

  return {
    resume() {
      if (!disposed) void ctx.resume().catch(() => {});
    },
    setMuted(value: boolean) {
      if (disposed) return;
      muted = value;
      master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.05);
    },
    update(race: Race, dt: number, active: boolean, controls?: Controls) {
      if (disposed) return;
      const k = race.player;
      const t = ctx.currentTime;
      const speed = Math.max(0, Math.abs(k.speed));
      const on = active && !muted && race.phase !== 'paused';
      const throttle = controls ? controls.throttle && !controls.brake : speed > 1;
      if (race.phase !== lastPhase) {
        if (race.phase === 'paused') {
          play('pause-on', 0.6);
          musicBus.gain.setTargetAtTime(MUSIC_LEVEL * 0.25, t, 0.08);
        } else if (lastPhase === 'paused') {
          play('pause-off', 0.6);
          musicBus.gain.setTargetAtTime(MUSIC_LEVEL, t, 0.08);
        }
        if (race.phase === 'ready') {
          finalLap = false;
          finished = false;
          gridPlayed = false;
          stopMusic();
        }
        lastPhase = race.phase;
      }
      if (ready) {
        updateEngines(race, on, throttle);
        // Late load: the first race starts before the samples finish decoding,
        // so pick the starting-grid or race theme up wherever the race is.
        if (race.phase === 'countdown' && !gridPlayed && !musicName && race.countdown > 0.8) {
          gridPlayed = true;
          playMusic('music-start', false);
        }
        if (race.phase === 'racing' && !finished && !musicName) playMusic(raceTheme(), true);
      } else {
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
      }
      if (on) {
        // Blipping the throttle on the grid revs the engine.
        revCooldown = Math.max(0, revCooldown - dt);
        if (race.phase === 'countdown' && throttle && !lastThrottle && revCooldown <= 0) {
          play('rev', 0.5);
          revCooldown = 0.4;
        }
        // Drift sparks change color.
        if (k.driftDir !== 0 && k.driftStage > lastStage)
          play(k.driftStage === 2 ? 'spark-orange' : 'spark-blue', 0.45);
        if (k.grounded && !lastGrounded && speed > 20) play('hop', 0.25);
        if (k.star > 0 && lastStar <= 0) play('star', 0.5);
      }
      lastThrottle = throttle;
      lastStage = k.driftDir === 0 ? 0 : k.driftStage;
      lastGrounded = k.grounded;
      lastStar = k.star;
      if (k.roulette > 0 && on && !buffers.has('roulette')) {
        rouletteTick -= dt;
        if (rouletteTick <= 0) {
          tone(1200 + Math.random() * 400, 0.04, 'square', 0.06);
          rouletteTick = 0.07;
        }
      }
      if (!active) return;
      for (const e of race.events) {
        const mine = e.kart === k.index;
        const other = race.karts[e.kart];
        // Nearby rivals' cues, quieter and positioned.
        const near = () => {
          if (!other || mine) return null;
          const dx = other.x - k.x;
          const dz = other.z - k.z;
          const dist = Math.hypot(dx, dz) || 1;
          if (dist > 70) return null;
          const side = (dx * Math.cos(k.heading) - dz * Math.sin(k.heading)) / dist;
          return { vol: Math.min(0.6, 8 / (dist + 8)), pan: Math.max(-0.9, Math.min(0.9, -side)) };
        };
        switch (e.type) {
          case 'countdown': {
            if (e.value === 3 && !musicName && buffers.has('music-start')) {
              gridPlayed = true;
              playMusic('music-start', false);
            }
            if (!play('countdown', 0.7)) tone(440, 0.25, 'square', 0.18);
            break;
          }
          case 'go': {
            if (!play('go', 0.75)) tone(880, 0.6, 'square', 0.2);
            playMusic(raceTheme(), true);
            break;
          }
          case 'rocket-start': {
            if (mine && !play('dash', 0.7)) burst(0.6, 3000, 0.25);
            break;
          }
          case 'burnout': {
            if (mine && !play('start-fail', 0.7)) tone(120, 0.6, 'sawtooth', 0.2, -60);
            break;
          }
          case 'item-box': {
            if (mine) {
              if (play('item-box', 0.6)) play('roulette', 0.45);
              else tone(1500, 0.18, 'triangle', 0.18, 600);
            } else {
              const n = near();
              if (n) play('item-box', n.vol * 0.5, 1, n.pan);
            }
            break;
          }
          case 'item-ready': {
            if (mine && !play('item-decide', 0.55)) tone(990, 0.15, 'triangle', 0.18);
            break;
          }
          case 'item-use': {
            const item = e.value ?? -1;
            const name: KartSample =
              item === 7 ? 'shell-red' : item === 5 || item === 6 ? 'shell-green' : 'item-equip';
            if (mine) {
              if (!play(name, 0.6)) tone(600, 0.12, 'square', 0.1, 300);
            } else {
              const n = near();
              if (n) play(name, n.vol, 1, n.pan);
            }
            if (item === 10) play('lightning', 0.75);
            break;
          }
          case 'boost':
          case 'mini-turbo': {
            if (mine) {
              if (!play('dash', 0.65)) burst(0.5, 4000, 0.22);
            } else {
              const n = near();
              if (n) play('dash', n.vol * 0.6, 1, n.pan);
            }
            break;
          }
          case 'spin': {
            if (mine) {
              if (!play('spin', 0.7)) tone(700, 0.5, 'triangle', 0.18, -500);
              play('banana', 0.5);
            }
            break;
          }
          case 'hit': {
            if (mine) {
              if (play('shell-hit', 0.8)) play('spin', 0.5);
              else {
                burst(0.4, 1500, 0.35);
                tone(300, 0.4, 'sawtooth', 0.15, -200);
              }
            } else {
              const n = near();
              if (n) play(other && other.star > 0 ? 'star-hit' : 'shell-hit', n.vol, 1, n.pan);
            }
            break;
          }
          case 'wall': {
            const v = Math.min(1, (e.value ?? 20) / 60);
            if (mine && !play('wall', 0.25 + v * 0.55))
              burst(0.12, 900, Math.min(0.3, (e.value ?? 20) / 120));
            break;
          }
          case 'explosion': {
            // The event names the Bob-omb's owner; position the cue at the blast itself.
            const blast = race.explosions.reduce<(typeof race.explosions)[number] | null>(
              (a, b) => (!a || b.age < a.age ? b : a),
              null,
            );
            let n = { vol: 0.5, pan: 0 };
            if (blast) {
              const dx = blast.x - k.x;
              const dz = blast.z - k.z;
              const dist = Math.hypot(dx, dz) || 1;
              const side = (dx * Math.cos(k.heading) - dz * Math.sin(k.heading)) / dist;
              n = {
                vol: Math.max(0.12, Math.min(0.95, 14 / (dist + 12))),
                pan: Math.max(-0.9, Math.min(0.9, -side)),
              };
            }
            if (!play('explosion', n.vol, 1, n.pan)) burst(0.9, 1200, 0.4);
            break;
          }
          case 'lightning': {
            if (!buffers.has('lightning')) burst(0.8, 6000, 0.35);
            break;
          }
          case 'lap': {
            if (mine && !play('lap', 0.6)) tone(660, 0.2, 'triangle', 0.2);
            break;
          }
          case 'final-lap': {
            if (!mine) break;
            finalLap = true;
            if (play('lap-final', 0.65)) {
              const jingle = playMusic('jingle-final-lap', false);
              schedule(resumeFinalTheme, Math.max(0.5, jingle) * 1000);
            } else {
              tone(660, 0.15, 'square', 0.18);
              schedule(() => tone(880, 0.3, 'square', 0.18), 160);
            }
            break;
          }
          case 'finish': {
            if (!mine) break;
            finished = true;
            if (play('goal', 0.75)) {
              stopMusic();
              // Mario Kart Wii plays the 2nd-6th fanfare for the top half of a
              // 12-racer field; with 8 racers that is 2nd-4th.
              const place = k.place;
              schedule(
                () =>
                  playMusic(
                    place === 1 ? 'jingle-1st' : place <= 4 ? 'jingle-podium' : 'jingle-low',
                    false,
                  ),
                1400,
              );
            } else
              [523, 659, 784, 1046].forEach((f, i) =>
                schedule(() => tone(f, 0.35, 'square', 0.16), i * 150),
              );
            break;
          }
          case 'respawn': {
            if (mine && !play('water', 0.5)) tone(500, 0.3, 'triangle', 0.14, 300);
            break;
          }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      for (const s of [oscA, oscB, noise, ...sources]) {
        try {
          s.stop();
        } catch {
          // already stopped
        }
      }
      sources.clear();
      void ctx.close().catch(() => {});
    },
  };
}
export type KartAudio = NonNullable<ReturnType<typeof createKartAudio>>;
