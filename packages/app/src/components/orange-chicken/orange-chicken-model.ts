/**
 * The serving model behind the Wok Kitchen game. A wok is a GPU: its step time grows with how
 * many orders it is cooking at once (batch size), a smaller number format cooks faster and
 * leaves room on the counter (the KV cache) at the price of flavour, and the counter is shared.
 * That gives the same tok/s vs tok/s/user Pareto trade-off the InferenceX charts show.
 */
import type { Food } from './orange-chicken-art';

export type Precision = 'FP4' | 'FP8' | 'BF16';
export const PRECISIONS: readonly Precision[] = ['FP4', 'FP8', 'BF16'];
export const BATCHES = [1, 2, 4, 8, 16, 32, 64] as const;
/** Display multiplier: one game step per second shows as this many tok/s. */
export const SCALE = 50;

export interface PrecisionSpec {
  /** Fixed seconds per decode step (reading the weights: memory-bound). */
  a: number;
  /** Extra seconds per step per order in the batch (compute-bound). */
  b: number;
  /** Counter space the weights take while the wok is cooking. */
  weights: number;
  /** KV cache units per unit of context. */
  kv: number;
  /** Tip multiplier: customers can taste what a narrow number format loses. */
  flavor: number;
}

export const PREC: Record<Precision, PrecisionSpec> = {
  FP4: { a: 0.3, b: 0.013, weights: 3, kv: 0.5, flavor: 0.84 },
  FP8: { a: 0.5, b: 0.025, weights: 6, kv: 1, flavor: 0.96 },
  BF16: { a: 0.8, b: 0.044, weights: 12, kv: 2, flavor: 1 },
};

/** Seconds per decode step with `active` orders in the wok; `hw` < 1 means better hardware. */
export function stepSeconds(prec: Precision, active: number, hw = 1): number {
  const p = PREC[prec];
  return (p.a + p.b * Math.max(1, active)) * hw;
}

/** Interactivity (tok/s/user) shown to the player. */
export function userRate(prec: Precision, active: number, hw = 1): number {
  return SCALE / stepSeconds(prec, active, hw);
}

/** Throughput (tok/s) of one wok. */
export function throughput(prec: Precision, active: number, hw = 1): number {
  return active <= 0 ? 0 : active * userRate(prec, active, hw);
}

/** The Pareto curve of one precision: one point per batch size. */
export function curve(prec: Precision, hw = 1): { batch: number; user: number; thr: number }[] {
  return BATCHES.map((batch) => ({
    batch,
    user: userRate(prec, batch, hw),
    thr: throughput(prec, batch, hw),
  }));
}

export interface Target {
  /** Minimum tok/s/user for the kitchen. */
  user: number;
  /** Minimum total tok/s for the kitchen. */
  thr: number;
}

export interface ZoneConfig {
  id: 1 | 2 | 3 | 4 | 5;
  woks: number;
  time: number;
  quota: number;
  /** Orders per second at rest. */
  arrival: number;
  tokens: [number, number];
  ctx: [number, number];
  /** Seconds a customer waits for the first bite (TTFT). */
  patience: number;
  target: Target;
  maxBatch: number;
  precisions: readonly Precision[];
  hazards: { oil: boolean; pigeons: boolean; fire: boolean; wind: boolean; boss: boolean };
  /** Counter capacity in KV units before upgrades. */
  memory: number;
  palette: { floor: string; floor2: string; wall: string; accent: string; sky: string };
}

export const ZONES: readonly ZoneConfig[] = [
  {
    id: 1,
    woks: 1,
    time: 150,
    quota: 8,
    arrival: 0.12,
    tokens: [8, 14],
    ctx: [1, 2],
    patience: 34,
    target: { user: 25, thr: 90 },
    maxBatch: 4,
    precisions: ['FP8'],
    hazards: { oil: false, pigeons: false, fire: false, wind: false, boss: false },
    memory: 40,
    palette: {
      floor: '#fff1d6',
      floor2: '#ffe3b5',
      wall: '#c98a12',
      accent: '#e8731a',
      sky: '#fff8ed',
    },
  },
  {
    id: 2,
    woks: 3,
    time: 180,
    quota: 16,
    arrival: 0.22,
    tokens: [10, 18],
    ctx: [1, 3],
    patience: 26,
    target: { user: 35, thr: 500 },
    maxBatch: 16,
    precisions: ['FP4', 'FP8', 'BF16'],
    hazards: { oil: true, pigeons: false, fire: true, wind: false, boss: false },
    memory: 40,
    palette: {
      floor: '#f6d9c4',
      floor2: '#ecc3a8',
      wall: '#7d1d0e',
      accent: '#c8321c',
      sky: '#fdf0ee',
    },
  },
  {
    id: 3,
    woks: 2,
    time: 200,
    quota: 18,
    arrival: 0.2,
    tokens: [12, 22],
    ctx: [2, 5],
    patience: 24,
    target: { user: 30, thr: 420 },
    maxBatch: 32,
    precisions: ['FP4', 'FP8', 'BF16'],
    hazards: { oil: true, pigeons: true, fire: true, wind: true, boss: false },
    memory: 44,
    palette: {
      floor: '#3b2b4a',
      floor2: '#33243f',
      wall: '#1d1430',
      accent: '#f6b93b',
      sky: '#1d1430',
    },
  },
  {
    id: 4,
    woks: 4,
    time: 240,
    quota: 20,
    arrival: 0.24,
    tokens: [10, 22],
    ctx: [1, 4],
    patience: 26,
    target: { user: 40, thr: 700 },
    maxBatch: 64,
    precisions: ['FP4', 'FP8', 'BF16'],
    hazards: { oil: true, pigeons: true, fire: true, wind: false, boss: true },
    memory: 48,
    palette: {
      floor: '#ffe9b8',
      floor2: '#ffd98a',
      wall: '#a82a14',
      accent: '#a82a14',
      sky: '#fff0d8',
    },
  },
  {
    // Act 5: the Glendale Galleria food court, where the first Panda Express opened in 1983.
    // Two-stage audit, wind from the mall doors, and the pass moves like the night market.
    id: 5,
    woks: 3,
    time: 270,
    quota: 22,
    arrival: 0.26,
    tokens: [12, 24],
    ctx: [2, 5],
    patience: 24,
    target: { user: 50, thr: 800 },
    maxBatch: 64,
    precisions: ['FP4', 'FP8', 'BF16'],
    hazards: { oil: true, pigeons: true, fire: true, wind: true, boss: true },
    memory: 52,
    palette: {
      floor: '#dcecee',
      floor2: '#c5dfe3',
      wall: '#0f5c63',
      accent: '#c4161f',
      sky: '#eaf6f7',
    },
  },
];

/**
 * The three audits of the finale: the inspector wants an operating point inside this box for 12 of
 * 20 seconds. Throughput is tokens served per second, and a kitchen at 0.26 orders per second of
 * about 18 tokens only produces about 230 tok/s on average, so the boxes sit inside what the
 * orders can feed (the earlier 450 to 900 boxes were out of reach without a rush).
 */
export const AUDITS: readonly Target[] = [
  { user: 45, thr: 200 },
  { user: 30, thr: 280 },
  { user: 60, thr: 240 },
];

export interface UpgradeSpec {
  id: 'stove' | 'counter' | 'shoes' | 'hands' | 'sous';
  max: number;
  /** Cost of the next level, by current level. */
  cost: readonly number[];
}

export const UPGRADES: readonly UpgradeSpec[] = [
  { id: 'stove', max: 4, cost: [40, 90, 160, 260] },
  { id: 'counter', max: 4, cost: [30, 70, 130, 210] },
  { id: 'shoes', max: 3, cost: [25, 60, 120] },
  { id: 'hands', max: 3, cost: [50, 110, 200] },
  { id: 'sous', max: 3, cost: [120, 200, 320] },
];

export function upgradeLevel(upgrades: Record<string, number>, id: UpgradeSpec['id']): number {
  return Math.max(0, Math.min(5, upgrades[id] ?? 0));
}

export const FOODS_LIST: readonly Food[] = ['chicken', 'box', 'dumpling', 'cookie'];

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** A small seeded generator so the Pareto Rush challenge is the same for everyone each day. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 1_831_565_813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Targets along the frontier for the timed Pareto Rush: from snappy to bulk. */
export const RUSH_TARGETS: readonly Target[] = [
  { user: 70, thr: 300 },
  { user: 50, thr: 600 },
  { user: 35, thr: 900 },
  { user: 25, thr: 1200 },
  { user: 45, thr: 450 },
];
