import { CSGO_AUDIO_EVENT, musicOn, soundOn } from './csgo-store';

/**
 * Radio clips from the theme folder, plus a procedural bed if the loop cannot start.
 * Nothing plays before a pointer gesture. Wired, not listened to.
 */

const CLIPS = {
  bombpl: '/decorative/csgo/bombpl.ogg',
  bombdef: '/decorative/csgo/bombdef.ogg',
  ctwin: '/decorative/csgo/ctwin.ogg',
  terwin: '/decorative/csgo/terwin.ogg',
  click: '/decorative/csgo/ui-click.ogg',
  accept: '/decorative/csgo/ui-accept.ogg',
  beep: '/decorative/csgo/c4-beep.ogg',
  tick: '/decorative/csgo/c4-tick.ogg',
  awp: '/decorative/csgo/awp.ogg',
  nice: '/decorative/csgo/very-nice.ogg',
  ez: '/decorative/csgo/ez4ence-start.ogg',
  ten: '/decorative/csgo/ez4ence-ten.ogg',
  loop: '/decorative/csgo/ez4ence-loop.ogg',
} as const;

type ClipId = keyof typeof CLIPS;

let unlocked = false;
let loopEl: HTMLAudioElement | null = null;
let loopOn = false;

interface Drive {
  intensity: number;
  heat: number;
}

const CLICKABLE =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], summary, [data-slot="button"]';

let ctx: AudioContext | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let timer = 0;
let step = 0;
let drive: Drive = { intensity: 0.15, heat: 0.2 };
let ducked = false;
let started = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.gain.value = 0.05;
    sfxGain.gain.value = 0.18;
    musicGain.connect(ctx.destination);
    sfxGain.connect(ctx.destination);
  }
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType, gain = 0.2, slide = 0) {
  if (!unlocked || !soundOn()) return;
  const audio = context();
  if (!audio || !sfxGain) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audio.currentTime);
  if (slide)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audio.currentTime + dur);
  amp.gain.setValueAtTime(gain, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  osc.connect(amp);
  amp.connect(sfxGain);
  osc.start();
  osc.stop(audio.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.15, band = 1800) {
  if (!unlocked || !soundOn()) return;
  const audio = context();
  if (!audio || !sfxGain) return;
  const length = Math.floor(audio.sampleRate * dur);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  const amp = audio.createGain();
  amp.gain.value = gain;
  src.connect(filter);
  filter.connect(amp);
  amp.connect(sfxGain);
  src.start();
}

function tickMusic() {
  const audio = context();
  if (!audio || !musicGain || !musicOn()) return;
  if (audio.state === 'suspended') return;
  const tempo = 92 + drive.intensity * 56;
  const beat = 60 / tempo;
  const now = audio.currentTime;
  const root = ducked ? 98 : 110;
  const notes = [root, root * 1.25, root * 1.5, root * 2];
  const freq = notes[step % notes.length]!;
  const osc = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  osc.type = step % 4 === 0 ? 'sawtooth' : 'square';
  osc.frequency.value = freq / (step % 8 > 5 ? 2 : 1);
  filter.type = 'lowpass';
  filter.frequency.value = 280 + (1 - drive.heat) * 1600 + drive.intensity * 400;
  amp.gain.setValueAtTime(ducked ? 0.04 : 0.07, now);
  amp.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.85);
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(musicGain);
  osc.start(now);
  osc.stop(now + beat);
  if (step % 2 === 0) noise(0.03, ducked ? 0.02 : 0.04, 4200);
  step = (step + 1) % 32;
  try {
    window.sessionStorage.setItem('csgo-music-step', String(step));
  } catch {
    // Private mode can reject sessionStorage. The bed still plays.
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(tickMusic, beat * 1000);
}

function startLoop() {
  if (!musicOn() || !unlocked) return;
  if (loopOn && loopEl && !loopEl.paused) return;
  if (!loopEl) {
    loopEl = new Audio(CLIPS.loop);
    loopEl.loop = true;
    loopEl.volume = 0.08;
    loopEl.addEventListener('error', () => {
      loopOn = false;
      if (!started && musicOn()) {
        started = true;
        tickMusic();
      }
    });
  }
  loopOn = true;
  void loopEl.play().catch(() => {
    loopOn = false;
    if (!started && musicOn()) {
      started = true;
      tickMusic();
    }
  });
}

export function playClip(id: ClipId) {
  if (!unlocked || !soundOn() || typeof Audio === 'undefined') return;
  const el = new Audio(CLIPS[id]);
  el.volume = id === 'ez' || id === 'ten' || id === 'loop' ? 0.32 : 0.48;
  void el.play().catch(() => undefined);
}

export function unlockCsgoAudio() {
  unlocked = true;
  const audio = context();
  if (audio && audio.state === 'suspended') void audio.resume();
  if (musicOn()) startLoop();
}

export function setCsgoDrive(next: Partial<Drive>) {
  drive = { ...drive, ...next };
}

export function duckCsgoMusic(on: boolean) {
  ducked = on;
  if (loopEl) loopEl.volume = on ? 0.02 : 0.08;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.02 : 0.05, ctx.currentTime, 0.05);
}

export function playClick() {
  if (unlocked && soundOn()) playClip('click');
  else blip(740 + Math.random() * 80, 0.045, 'square', 0.08);
}

export function playHover() {
  if (!unlocked) return;
  blip(520, 0.03, 'triangle', 0.03);
}

export function playShot(kind: 'usp' | 'mp9' | 'ak' | 'awp') {
  if (kind === 'awp' && unlocked && soundOn()) {
    playClip('awp');
    return;
  }
  const band = kind === 'awp' ? 280 : kind === 'ak' ? 520 : kind === 'mp9' ? 900 : 1400;
  noise(kind === 'awp' ? 0.18 : 0.07, kind === 'usp' ? 0.12 : 0.2, band);
  blip(kind === 'awp' ? 90 : 140, 0.08, 'sawtooth', 0.06, -40);
}

export function playHit() {
  blip(880, 0.05, 'square', 0.07, 200);
}

export function playBomb(progress: number) {
  if (unlocked && soundOn()) playClip(progress > 70 ? 'beep' : 'tick');
  else blip(220 + progress * 8, 0.06, 'square', 0.06);
}

export function playSting() {
  blip(523, 0.12, 'square', 0.1, 80);
  window.setTimeout(() => blip(659, 0.14, 'square', 0.1), 90);
}

export function stopCsgoAudio() {
  window.clearTimeout(timer);
  started = false;
  loopOn = false;
  if (loopEl) {
    loopEl.pause();
    loopEl.src = '';
    loopEl = null;
  }
  if (ctx) void ctx.close();
  ctx = null;
  musicGain = null;
  sfxGain = null;
}

function onPointer(event: Event) {
  unlockCsgoAudio();
  const target = event.target;
  if (!(target instanceof Element)) return;
  const hit = target.closest(CLICKABLE);
  if (!hit || hit.closest('[data-csgo-silent]')) return;
  playClick();
}

function onToggle() {
  if (musicOn()) {
    if (unlocked) startLoop();
  } else {
    window.clearTimeout(timer);
    started = false;
    loopOn = false;
    if (loopEl) loopEl.pause();
  }
}

export function bindCsgoAudio(): () => void {
  let lastHover = 0;
  const onHover = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(CLICKABLE) || target.closest('[data-csgo-silent]')) return;
    const now = performance.now();
    if (now - lastHover < 180) return;
    lastHover = now;
    playHover();
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('mouseover', onHover, true);
  window.addEventListener(CSGO_AUDIO_EVENT, onToggle);
  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('mouseover', onHover, true);
    window.removeEventListener(CSGO_AUDIO_EVENT, onToggle);
    stopCsgoAudio();
  };
}
