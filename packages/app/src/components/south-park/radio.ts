import { paperSynth, type Cue } from './paper-synth';
import { enabled, type Channel } from './preferences';
export type Clip =
  | 'authority'
  | 'home'
  | 'kenny'
  | 'mumble'
  | 'kitty'
  | 'fat'
  | 'pie'
  | 'jobs'
  | 'theme'
  | 'transition';
const root = '/decorative/south-park/audio/';
/** The town loop, recorded music stings and recorded speech have independent lifetimes. */
export function makeRadio() {
  const synth = paperSynth(),
    recent = new Map<Clip, number>();
  const players: Partial<Record<Channel, HTMLAudioElement>> = {};
  let awake = false,
    inside = false,
    news = false,
    last = 0;
  function stopChannel(kind: Channel) {
    const player = players[kind];
    if (!player) return;
    player.pause();
    player.removeAttribute('src');
    player.load();
    delete players[kind];
  }
  function sync() {
    for (const k of ['sound', 'music'] as const) if (!enabled(k)) stopChannel(k);
    if (awake && !inside && !news && !document.hidden) synth.activate();
    synth.sync();
    if (news && awake && !document.hidden && enabled('music') && !players.music) {
      const bed = new Audio(`${root}studio-bed.mp3`);
      bed.loop = true;
      bed.volume = 0.09;
      players.music = bed;
      void bed.play().catch(() => {
        if (players.music === bed) stopChannel('music');
      });
    }
  }
  function hide() {
    synth.pause();
    stopChannel('sound');
    stopChannel('music');
  }
  return {
    slate(n: number) {
      synth.drive(n === 3 ? 32 : 0, 0, n);
      if (awake && !inside && !news) synth.cue(n === 1 ? 'rustle' : n === 2 ? 'snip' : 'wave');
    },
    unlock() {
      awake = true;
      if (!inside && !news) synth.activate();
    },
    cue(c: Cue) {
      if (awake && !inside) synth.cue(c);
    },
    room(open: boolean) {
      inside = open;
      stopChannel('sound');
      stopChannel('music');
      if (open) synth.pause();
      else sync();
    },
    newsroom(open: boolean) {
      news = open;
      stopChannel('music');
      stopChannel('sound');
      if (open) synth.pause();
      sync();
    },
    sync,
    hide,
    play(clip: Clip, kind: Channel = 'sound', priority = false) {
      const now = Date.now();
      if (!awake || !enabled(kind) || document.hidden || (!priority && now - last < 1500)) return;
      if (now - (recent.get(clip) ?? 0) < (clip === 'kenny' || clip === 'mumble' ? 1050 : 4200))
        return;
      if (players[kind] && !players[kind]?.ended && !priority) return;
      stopChannel(kind);
      last = now;
      recent.set(clip, now);
      if (kind === 'sound') {
        synth.duck();
        if (players.music) players.music.volume = 0.04;
      }
      const player = new Audio(`${root}${clip}.mp3`);
      players[kind] = player;
      player.volume = kind === 'sound' ? 0.23 : players.sound?.ended === false ? 0.04 : 0.13;
      player.addEventListener(
        'ended',
        () => {
          if (players[kind] === player) delete players[kind];
          if (kind === 'sound' && players.music) players.music.volume = 0.13;
        },
        { once: true },
      );
      void player.play().catch(() => {
        if (players[kind] === player) stopChannel(kind);
      });
    },
    stop() {
      hide();
      synth.dispose();
    },
  };
}
