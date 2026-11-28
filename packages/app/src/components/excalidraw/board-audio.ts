type GameCue = 'tap' | 'hover' | 'route' | 'vent' | 'danger' | 'sla' | 'clear';
type SiteCue = keyof typeof sketchNotes;
export type Cue = GameCue | SiteCue;
export const AUDIO_KEYS = { sound: 'excalidraw-sound', music: 'excalidraw-music' } as const;
const notes: Record<GameCue, number[]> = {
  tap: [370, 540],
  hover: [330],
  route: [440, 587, 659],
  vent: [294, 196, 147],
  danger: [156, 148, 130],
  sla: [523, 349],
  clear: [392, 523, 659, 784],
};
const sketchNotes = {
  pencil: [780, 594, 643],
  paper: [295, 407, 496],
  flip: [1010, 756, 506],
  pick: [542, 679],
  drop: [246, 365, 490],
  wire: [330, 440, 587],
  mark: [615, 825],
  stamp: [293, 392, 587, 784],
};
const enabled = (key: keyof typeof AUDIO_KEYS) => localStorage.getItem(AUDIO_KEYS[key]) === 'true';

export function createBoardAudio() {
  let ctx: AudioContext | undefined;
  let musicBus: GainNode | undefined;
  let effectsBus: GainNode | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastHover = 0;
  let beat = 0;
  let next = 0;
  let heat = 0;
  let inGame = false;
  let paused = false;
  let paper = 'paper';
  let onChart = false;
  const gameVoices = new Set<OscillatorNode>();
  const tone = (
    hz: number,
    at: number,
    length: number,
    gain: number,
    bus: AudioNode,
    type: OscillatorType,
  ) => {
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    envelope.gain.setValueAtTime(0.001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.016);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + length);
    oscillator.connect(envelope).connect(bus);
    if (inGame) gameVoices.add(oscillator);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
    oscillator.addEventListener(
      'ended',
      () => {
        gameVoices.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      },
      { once: true },
    );
  };
  const schedule = () => {
    if (!ctx || !musicBus || ctx.state !== 'running' || document.hidden) return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.015;
    if (next > ctx.currentTime + 0.12 || !enabled('music')) return;
    const motif = inGame
      ? [146.83, 220, 293.66, 261.63, 174.61, 261.63, 349.23, 293.66]
      : [130.81, 196, 261.63, 329.63, 116.54, 174.61, 233.08, 293.66];
    const pitch = paper === 'blueprint' ? 0.75 : paper === 'vellum' ? 1.122 : onChart ? 0.891 : 1;
    const hz = motif[beat % motif.length] * (inGame ? 1 + heat * 0.05 : pitch);
    tone(hz, next, inGame ? 0.59 : 0.85, inGame ? 0.042 : 0.026, musicBus, 'sine');
    if (beat % 4 === 0) tone(hz / 2, next, 1.2, inGame ? 0.057 : 0.025, musicBus, 'triangle');
    if (inGame && heat > 0.6) tone(hz * 2, next + 0.09, 0.13, 0.014, musicBus, 'triangle');
    beat++;
    next += inGame ? (paused ? 0.59 : 0.44 - heat * 0.19) : 0.72;
  };
  return {
    unlock() {
      if ((!enabled('music') && !enabled('sound')) || !window.AudioContext) return;
      try {
        if (!ctx) {
          ctx = new AudioContext();
          musicBus = ctx.createGain();
          effectsBus = ctx.createGain();
          musicBus.connect(ctx.destination);
          effectsBus.connect(ctx.destination);
          musicBus.gain.value = enabled('music') && !document.hidden ? 1 : 0;
          effectsBus.gain.value = enabled('sound') && !document.hidden ? 1 : 0;
          timer = setInterval(schedule, 60);
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch {
        // Audio support is optional.
      }
    },
    cue(name: Cue) {
      if (!ctx || !effectsBus || ctx.state !== 'running' || !enabled('sound') || document.hidden)
        return;
      const t = ctx.currentTime;
      if (Object.hasOwn(sketchNotes, name)) {
        for (const [i, hz] of sketchNotes[name as SiteCue].entries()) {
          const percussive = name === 'pencil' || name === 'flip' || name === 'drop';
          tone(
            hz,
            t + 0.047 * i,
            percussive ? 0.076 : 0.18,
            0.034,
            effectsBus,
            percussive ? 'triangle' : 'sine',
          );
        }
        return;
      }
      if (!inGame) return;
      if (name === 'hover' && t - lastHover < 0.13) return;
      if (name === 'hover') lastHover = t;
      for (const [i, hz] of notes[name as GameCue].entries()) {
        tone(
          hz,
          t + i * 0.071,
          name === 'hover' ? 0.09 : 0.17,
          name === 'hover' ? 0.018 : 0.063,
          effectsBus,
          name === 'danger' || name === 'sla' ? 'triangle' : 'sine',
        );
      }
      if (musicBus && name !== 'hover' && enabled('music')) {
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setTargetAtTime(0.36, t, 0.018);
        musicBus.gain.setTargetAtTime(1, t + 0.16, 0.2);
      }
    },
    sync() {
      if (!ctx || !musicBus || !effectsBus) return;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(
        enabled('music') && !document.hidden ? 1 : 0,
        ctx.currentTime,
        0.035,
      );
      effectsBus.gain.setTargetAtTime(
        enabled('sound') && !document.hidden ? 1 : 0,
        ctx.currentTime,
        0.018,
      );
    },
    game(value: boolean, pressure = 0, stopped = false) {
      if (inGame && !value) {
        for (const oscillator of gameVoices) oscillator.stop();
        gameVoices.clear();
        next = ctx?.currentTime ?? 0;
        beat = 0;
      }
      inGame = value;
      heat = pressure;
      paused = stopped;
    },
    scene(value: string, chart: boolean) {
      paper = value;
      onChart = chart;
    },
    dispose() {
      clearInterval(timer);
      if (ctx) void ctx.close().catch(() => {});
      gameVoices.clear();
      ctx = undefined;
      musicBus = undefined;
      effectsBus = undefined;
    },
  };
}

export type BoardAudio = ReturnType<typeof createBoardAudio>;
