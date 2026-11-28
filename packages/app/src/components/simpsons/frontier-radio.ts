import { enabled } from './audio';
/** An original four-bar pit band. Only created by a game control gesture, never before. */
export function rinkRadio() {
  let ac: AudioContext | null = null,
    clock = 0,
    n = 0,
    active = false;
  let energy = 0.3,
    heat = 0,
    duckUntil = 0;
  const oscillators = new Set<OscillatorNode>();
  const pitch = (f: number, length: number, vol: number, type: OscillatorType) => {
    if (!ac || ac.state !== 'running') return;
    const osc = ac.createOscillator(),
      g = ac.createGain(),
      at = ac.currentTime;
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(at + length + 0.02);
    oscillators.add(osc);
    osc.addEventListener(
      'ended',
      () => {
        oscillators.delete(osc);
        osc.disconnect();
        g.disconnect();
      },
      { once: true },
    );
  };
  const quiet = () => {
    clearTimeout(clock);
    clock = 0;
    for (const osc of oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
  };
  const sync = () => {
    quiet();
    if (!active || document.hidden || !enabled('music') || !ac) return;
    const beat = () => {
      if (!active || document.hidden || !enabled('music')) return;
      const bass = [110, 110, 146.8, 130.8, 98, 98, 146.8, 123.5];
      const duck = performance.now() < duckUntil ? 0.26 : 1;
      pitch(bass[n % 8] * (1 + energy * 0.05), 0.13, 0.022 * duck, 'triangle');
      if (n % 2 === 1)
        pitch(
          [329.6, 392, 440, 293.7][(n >> 1) % 4] * (heat > 0 ? 0.75 : 1),
          0.1,
          0.009 * duck,
          'sine',
        );
      n++;
      clock = window.setTimeout(beat, 345 - energy * 115);
    };
    beat();
  };
  const start = () => {
    active = true;
    try {
      ac ??= new AudioContext();
      if (ac.state === 'suspended') void ac.resume().catch(() => {});
    } catch {
      /* unsupported */
    }
    sync();
  };
  window.addEventListener('simpsons-music-toggle', sync);
  window.addEventListener('simpsons-sound-toggle', sync);
  const stop = (silence = true) => {
    active = false;
    quiet();
    if (silence) window.dispatchEvent(new Event('simpsons-rink-silence'));
  };
  return {
    start,
    stop,
    drive(speed: number, pressure: number) {
      energy = Math.max(0, Math.min(1, speed));
      heat = pressure;
    },
    clip(name: string) {
      if (!enabled('sound') || document.hidden) return;
      duckUntil = performance.now() + (name === 'ollie' || name === 'stamp' ? 150 : 1700);
      if (name === 'ollie' || name === 'stamp') {
        pitch(name === 'stamp' ? 523 : 220, 0.1, 0.055, 'triangle');
        pitch(name === 'stamp' ? 784 : 440, 0.09, 0.022, 'sine');
      } else window.dispatchEvent(new CustomEvent('simpsons-rink-sfx', { detail: name }));
    },
    dispose() {
      stop();
      window.removeEventListener('simpsons-music-toggle', sync);
      window.removeEventListener('simpsons-sound-toggle', sync);
      if (ac) void ac.close().catch(() => {});
      ac = null;
    },
  };
}
