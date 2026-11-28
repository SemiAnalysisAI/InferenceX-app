import type { Attempt } from './halo-relay-engine';
import { haloMusicEnabled } from './halo-music';

export function relayEngineAudio() {
  let ctx: AudioContext | undefined;
  let drive: OscillatorNode | undefined;
  let pad: OscillatorNode | undefined;
  let filter: BiquadFilterNode | undefined;
  let level: GainNode | undefined;
  let muted = true;
  return {
    start() {
      if (!window.AudioContext || !haloMusicEnabled()) return;
      try {
        if (!ctx) {
          ctx = new AudioContext();
          drive = ctx.createOscillator();
          drive.type = 'triangle';
          pad = ctx.createOscillator();
          pad.type = 'sine';
          filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          level = ctx.createGain();
          level.gain.value = 0;
          drive.connect(filter);
          pad.connect(filter);
          filter.connect(level).connect(ctx.destination);
          drive.start();
          pad.start();
        }
        if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      } catch {}
    },
    update(run: Attempt) {
      if (!ctx || !drive || !pad || !filter || !level) return;
      if (!haloMusicEnabled()) {
        if (!muted) level.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        muted = true;
        return;
      }
      const velocity = Math.hypot(run.velocity.x, run.velocity.y);
      const clock = ctx.currentTime;
      const root = [73, 82, 65, 58, 55][run.chapter];
      drive.frequency.setTargetAtTime(root + velocity * 0.2 + run.boss.phase * 1.8, clock, 0.15);
      pad.frequency.setTargetAtTime(root * (run.cache > 0 ? 1.5 : 2), clock, 0.25);
      filter.frequency.setTargetAtTime(180 + run.heat * 12, clock, 0.2);
      if (muted) level.gain.setTargetAtTime(0.016, clock, 0.2);
      muted = false;
    },
    stop() {
      if (muted || !ctx || !level) return;
      level.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      muted = true;
    },
    close() {
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    },
  };
}
