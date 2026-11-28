export const HALO_ART = '/decorative/halo/';
export const HALO_TRACE = 'halo-cartographer-trace';
export const HALO_FRONTIER = 'halo-cartographer-frontier';

export const lines = {
  weapon: ['I need a weapon.', '我需要一件武器。'],
  bomb: ['To give the Covenant back their bomb.', '把星盟的炸弹还给他们。'],
  finish: ['Sir, finishing this fight.', '长官，结束这场战斗。'],
  sleep: ['Wake me... When you need me.', '叫醒我……当你需要我的时候。'],
  started: ["No. I think we're just getting started.", '不。我想我们才刚刚开始。'],
  together: [
    "Keep your head down. There's two of us in here now, remember?",
    '低下头。现在这里有两个人，记得吗？',
  ],
  promise: [
    "Don't make a girl a promise... If you know you can't keep it.",
    '如果你知道自己做不到……就别向女孩许诺。',
  ],
  wake: ['Wake up, Chief. I need you.', '醒醒，士官长，我需要你。'],
  light: ['Light the ring. Destroy the Flood.', '点亮环带。消灭洪魔。'],
  fight: ['Finish The Fight', '结束这场战斗'],
  cave: [
    'This cave is not a natural formation. Someone built it, so it must lead somewhere.',
    '这座洞穴并非天然形成。有人建造了它，一定通向某个地方。',
  ],
  map: [
    "The Cartographer is a map room that will lead us to Halo's control center.",
    '制图师是一座地图室，将带我们找到环带的控制中心。',
  ],
  flood: ["I've got a bad feeling about this...", '我有种不祥的预感……'],
  drive: [
    'Gun it, Chief! Jump! Floor it! Right into the hangar!',
    '加速，士官长！跳！踩到底！直冲机库！',
  ],
} as const;

export type HaloClip = 'shield-recharge' | 'double-kill' | 'grunt-birthday' | 'wort-wort-wort';

export function playHaloClip(clip: HaloClip, active: { current: HTMLAudioElement | null }) {
  stopHaloClip(active);
  const audio = new Audio(`${HALO_ART}${clip}.ogg`);
  audio.volume = 0.38;
  active.current = audio;
  audio.addEventListener(
    'ended',
    () => {
      if (active.current === audio) active.current = null;
    },
    { once: true },
  );
  void audio.play().catch(() => {
    if (active.current === audio) active.current = null;
  });
}

export function stopHaloClip(active: { current: HTMLAudioElement | null }) {
  active.current?.pause();
  active.current = null;
}
