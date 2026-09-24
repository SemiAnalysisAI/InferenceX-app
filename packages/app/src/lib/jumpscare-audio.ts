/**
 * Synthesized jumpscare sound — no audio asset to license or ship.
 *
 * Three layers, all built from Web Audio primitives:
 *   1. Sub impact: a sine dropping 70 Hz → 28 Hz. Felt more than heard.
 *   2. Scream: three detuned sawtooths sweeping up through a resonant bandpass,
 *      with a fast vibrato and hard waveshaper distortion so it tears.
 *   3. Static burst: white noise through a highpass, snapping in and decaying.
 *
 * A compressor on the master bus stops the sum from clipping while keeping
 * the transient loud. Total length ≈ 1.7 s to match the overlay.
 */

const SCREAM_LENGTH_S = 1.7;

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const k = amount;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Create (or reuse) an AudioContext from inside a user-activation handler so
 * the browser lets it play later. Returns `null` when Web Audio is missing.
 */
export function unlockJumpscareAudio(existing: AudioContext | null): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  const ctx = existing ?? new window.AudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Fire the scream. Safe to call when the context failed to unlock; it just no-ops. */
export function playJumpscareSound(ctx: AudioContext | null, volume = 0.9): void {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + 0.01;
    const tEnd = t0 + SCREAM_LENGTH_S;

    const master = ctx.createGain();
    master.gain.setValueAtTime(volume, t0);
    master.gain.setValueAtTime(volume, tEnd - 0.25);
    master.gain.linearRampToValueAtTime(0, tEnd);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, t0);
    compressor.knee.setValueAtTime(12, t0);
    compressor.ratio.setValueAtTime(8, t0);
    compressor.attack.setValueAtTime(0.002, t0);
    compressor.release.setValueAtTime(0.15, t0);

    master.connect(compressor).connect(ctx.destination);

    // 1. Sub impact ---------------------------------------------------------
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, t0);
    sub.frequency.exponentialRampToValueAtTime(28, t0 + 0.6);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0, t0);
    subGain.gain.linearRampToValueAtTime(1.1, t0 + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
    sub.connect(subGain).connect(master);
    sub.start(t0);
    sub.stop(t0 + 1.2);

    // 2. Scream -------------------------------------------------------------
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(180);
    shaper.oversample = '4x';

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.setValueAtTime(3.5, t0);
    band.frequency.setValueAtTime(600, t0);
    band.frequency.exponentialRampToValueAtTime(2400, t0 + 0.35);
    band.frequency.exponentialRampToValueAtTime(1400, tEnd);

    const screamGain = ctx.createGain();
    screamGain.gain.setValueAtTime(0, t0);
    screamGain.gain.linearRampToValueAtTime(0.8, t0 + 0.03);
    screamGain.gain.setValueAtTime(0.8, t0 + 0.9);
    screamGain.gain.exponentialRampToValueAtTime(0.001, tEnd);

    shaper.connect(band).connect(screamGain).connect(master);

    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(9, t0);
    vibrato.frequency.linearRampToValueAtTime(16, tEnd);
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(40, t0);
    vibrato.connect(vibratoDepth);
    vibrato.start(t0);
    vibrato.stop(tEnd);

    for (const detune of [-18, 0, 23]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detune, t0);
      osc.frequency.setValueAtTime(320, t0);
      osc.frequency.exponentialRampToValueAtTime(1350, t0 + 0.28);
      osc.frequency.exponentialRampToValueAtTime(980, t0 + 0.9);
      osc.frequency.exponentialRampToValueAtTime(1500, tEnd);
      vibratoDepth.connect(osc.frequency);
      osc.connect(shaper);
      osc.start(t0);
      osc.stop(tEnd);
    }

    // 3. Static burst -------------------------------------------------------
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, SCREAM_LENGTH_S);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1800, t0);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, t0);
    noiseGain.gain.linearRampToValueAtTime(0.7, t0 + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.4);
    noiseGain.gain.setValueAtTime(0.08, tEnd - 0.3);
    noiseGain.gain.linearRampToValueAtTime(0.5, tEnd - 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, tEnd);
    noise.connect(hp).connect(noiseGain).connect(master);
    noise.start(t0);
    noise.stop(tEnd);
  } catch {
    // Audio is a garnish; never let it break the page.
  }
}
