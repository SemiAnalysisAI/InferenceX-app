export const STOPS = [
  { id: 'prefill', quota: 13, gap: 3.75, speed: 0.105, tax: 1 },
  { id: 'cache', quota: 14, gap: 3.55, speed: 0.116, tax: 1.55 },
  { id: 'decode', quota: 15, gap: 3.3, speed: 0.112, tax: 1 },
  { id: 'pass', quota: 16, gap: 3.1, speed: 0.106, tax: 1 },
  { id: 'profiler', quota: 17, gap: 2.98, speed: 0.104, tax: 1.1 },
] as const;
export const SHOP = [
  { id: 'plow', cost: 3 },
  { id: 'cache', cost: 4 },
  { id: 'express', cost: 5 },
  { id: 'scoop', cost: 4 },
] as const;
export type ShopItem = (typeof SHOP)[number]['id'];
export type Mode = 'episode' | 'endless' | 'lab';
export interface RecordBook {
  stage: number;
  medal: number;
  best: number[];
  wins: number;
  seed: number;
  labStop: number;
  slow: boolean;
  stamps: number[];
  kit: number;
  slot: number;
  layouts: number[][];
}
export const BOOK = 'south-park-dispatch-record-v1';
export const freshBook = (): RecordBook => ({
  stage: 1,
  medal: 0,
  best: [0, 0, 0],
  wins: 0,
  seed: 285,
  labStop: 1,
  slow: false,
  stamps: [0, 0, 0, 0, 0],
  kit: 0,
  slot: 0,
  layouts: [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 2],
  ],
});
const bounded = (n: unknown, max: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0;
export function readBook(): RecordBook {
  const clean = freshBook();
  try {
    const v = JSON.parse(localStorage.getItem(BOOK) ?? 'null');
    if (!v) return clean;
    return {
      stage: Math.max(1, bounded(v.stage, 5)),
      medal: bounded(v.medal, 3),
      wins: bounded(v.wins, 9999),
      best: [0, 1, 2].map((i) => bounded(v.best?.[i], 99999999)),
      seed: bounded(v.seed, 9999),
      labStop: Math.max(1, bounded(v.labStop, 5)),
      slow: v.slow === true,
      stamps: [0, 1, 2, 3, 4].map((i) => bounded(v.stamps?.[i], 3)),
      kit: bounded(v.kit, 2),
      slot: bounded(v.slot, 2),
      layouts: [0, 1, 2].map((s) => [0, 1, 2, 3].map((i) => bounded(v.layouts?.[s]?.[i], 2))),
    };
  } catch {
    return clean;
  }
}
export function saveBook(v: RecordBook) {
  try {
    localStorage.setItem(BOOK, JSON.stringify(v));
  } catch {}
}
export function stopFor(wave: number) {
  return STOPS[(wave - 1) % STOPS.length];
}
