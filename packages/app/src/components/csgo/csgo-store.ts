export type CsgoSide = 'ct' | 't' | 'night' | 'day';

export const CSGO_SIDES: CsgoSide[] = ['ct', 't', 'night', 'day'];
export const CSGO_SAVE_EVENT = 'csgo-save';
export const CSGO_AUDIO_EVENT = 'csgo-audio';

const SIDE_KEY = 'csgo-side';
const SOUND_KEY = 'csgo-sound';
const MUSIC_KEY = 'csgo-music';
const SAVE_KEY = 'csgo-ops-save';

export interface CsgoSave {
  xp: number;
  medals: Record<string, number>;
  unlocked: string[];
  bestEndless: number;
  zonesSeen: string[];
  clears: number;
  kits: string[];
}

const EMPTY: CsgoSave = {
  xp: 0,
  medals: {},
  unlocked: ['usp'],
  bestEndless: 0,
  zonesSeen: [],
  clears: 0,
  kits: [],
};

export function readFlag(key: string, fallback = true): boolean {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value !== 'false';
}

export function writeFlag(key: string, on: boolean) {
  window.localStorage.setItem(key, String(on));
  window.dispatchEvent(new CustomEvent(CSGO_AUDIO_EVENT));
}

export const soundOn = () => readFlag(SOUND_KEY);
export const musicOn = () => readFlag(MUSIC_KEY);
export const setSoundOn = (on: boolean) => writeFlag(SOUND_KEY, on);
export const setMusicOn = (on: boolean) => writeFlag(MUSIC_KEY, on);

export function readSide(): CsgoSide {
  if (typeof window === 'undefined') return 'ct';
  const value = window.localStorage.getItem(SIDE_KEY);
  return value === 't' || value === 'night' || value === 'day' || value === 'ct' ? value : 'ct';
}

export function writeSide(side: CsgoSide) {
  window.localStorage.setItem(SIDE_KEY, side);
  document.documentElement.dataset.csgoSide = side;
}

export function applySide(side = readSide()) {
  document.documentElement.dataset.csgoSide = side;
}

export function clearSide() {
  delete document.documentElement.dataset.csgoSide;
}

export function readSave(): CsgoSave {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '') as Partial<CsgoSave>;
    return {
      ...EMPTY,
      ...parsed,
      medals: parsed.medals ?? {},
      unlocked: parsed.unlocked?.length ? parsed.unlocked : ['usp'],
      zonesSeen: parsed.zonesSeen ?? [],
      kits: parsed.kits ?? [],
    };
  } catch {
    return { ...EMPTY, medals: {}, unlocked: ['usp'], zonesSeen: [], kits: [] };
  }
}

export function writeSave(save: CsgoSave) {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  window.dispatchEvent(new CustomEvent(CSGO_SAVE_EVENT));
}

export function mergeSave(patch: Partial<CsgoSave> & { medal?: { id: string; tier: number } }) {
  const current = readSave();
  const medals = { ...current.medals };
  if (patch.medal) medals[patch.medal.id] = Math.max(medals[patch.medal.id] ?? 0, patch.medal.tier);
  const next: CsgoSave = {
    xp: Math.max(current.xp, patch.xp ?? current.xp),
    medals,
    unlocked: [...new Set([...current.unlocked, ...(patch.unlocked ?? [])])],
    bestEndless: Math.max(current.bestEndless, patch.bestEndless ?? 0),
    zonesSeen: [...new Set([...current.zonesSeen, ...(patch.zonesSeen ?? [])])],
    clears: Math.max(current.clears, patch.clears ?? 0),
    kits: [...new Set([...current.kits, ...(patch.kits ?? [])])],
  };
  writeSave(next);
  return next;
}

export interface CsgoRank {
  en: string;
  zh: string;
  stars: number;
}

const RANKS: { xp: number; en: string; zh: string }[] = [
  { xp: 0, en: 'Silver I', zh: '白银 I' },
  { xp: 180, en: 'Silver Elite', zh: '白银精英' },
  { xp: 420, en: 'Gold Nova', zh: '黄金新星' },
  { xp: 780, en: 'Master Guardian', zh: '大师级卫士' },
  { xp: 1200, en: 'Legendary Eagle', zh: '传奇之鹰' },
  { xp: 1800, en: 'Supreme', zh: '至尊' },
  { xp: 2600, en: 'Global Elite', zh: '全球精英' },
];

export function rankOf(save: CsgoSave): CsgoRank {
  let rank = RANKS[0]!;
  for (const row of RANKS) if (save.xp >= row.xp) rank = row;
  const stars = Object.values(save.medals).reduce((sum, tier) => sum + tier, 0);
  return { en: rank.en, zh: rank.zh, stars };
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
