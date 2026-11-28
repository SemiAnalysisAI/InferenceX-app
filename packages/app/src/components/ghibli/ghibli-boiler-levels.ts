/**
 * Chapters and upgrades for Kamaji's Boiler. Each chapter changes the rules, not just the pace:
 * a film's world adds one hazard or constraint that maps to a real inference trade-off.
 */
import type { ChapterId, UpgradeId } from './ghibli-boiler-store';

export type LumpKind = 'fp4' | 'fp8' | 'bf16' | 'longkv' | 'gold' | 'ash' | 'curse';
export type RequestKind = 'fp4' | 'fp8' | 'bf16' | 'longkv';

export interface KindSpec {
  /** KV cache units held per user while decoding. */
  kv: number;
  /** Output tokens per user before the request finishes. */
  tokens: number;
  /** Decode speed multiplier (lower precision decodes faster). */
  speed: number;
  /** Heat fed to Calcifer per user on admission. */
  heat: number;
  colour: string;
  rim: string;
}

export const KINDS: Record<LumpKind, KindSpec> = {
  fp4: { kv: 1.4, tokens: 150, speed: 1.3, heat: 4.2, colour: '#4d5a4f', rim: '#a9c49a' },
  fp8: { kv: 2.2, tokens: 190, speed: 1.12, heat: 5, colour: '#3d3a38', rim: '#e0b860' },
  bf16: { kv: 3.2, tokens: 240, speed: 0.95, heat: 6.2, colour: '#2f2a2a', rim: '#d97c5a' },
  longkv: { kv: 6.5, tokens: 300, speed: 0.95, heat: 6.8, colour: '#3a3326', rim: '#8fb7c9' },
  gold: { kv: 9, tokens: 0, speed: 1, heat: -18, colour: '#c99a2e', rim: '#f6dc8a' },
  ash: { kv: 2, tokens: 0, speed: 1, heat: -22, colour: '#6d6a68', rim: '#b5b0aa' },
  curse: { kv: 4, tokens: 60, speed: 1, heat: 2, colour: '#4a2a38', rim: '#b0475f' },
};

export interface Hazards {
  /** No-Face drifts over the open door and throws gold that clogs KV and chokes the fire. */
  noface?: boolean;
  /** Long-context River Spirit lumps arrive in surges. */
  river?: boolean;
  /** The castle only walks while heat stays above the line; walking is the goal. */
  castle?: boolean;
  /** War ash falls down the black door chute. */
  ash?: boolean;
  /** Night shrinks the KV cache; kodama rattle a warning before dusk. */
  night?: boolean;
  /** Cursed lumps slow decoding when admitted. */
  curse?: boolean;
  /** Waves push queues sideways and the tide shortens chutes. */
  tide?: boolean;
  /** Parakeets snatch finished output tokens unless shooed. */
  parakeets?: boolean;
  /** No-Face rampages as a three-phase boss whose hunger is the goal. */
  boss?: boolean;
}

export interface Chapter {
  id: ChapterId;
  /** Campaign act, 1 to 4. */
  act: 1 | 2 | 3 | 4;
  /** Index into the banner's film set, used for the still behind the field. */
  film: 'spirited' | 'howl' | 'mononoke' | 'ponyo' | 'heron' | 'totoro';
  lanes: 2 | 3 | 4;
  /** Seconds between arrivals at the start and at the end of the shift. */
  spawnStart: number;
  spawnEnd: number;
  mix: Partial<Record<RequestKind, number>>;
  /** Users per lump (batch members), min and max. */
  users: [number, number];
  goal: number;
  seconds: number;
  /** Interactivity service level, tok/s/user. Below it tokens only count half. */
  slo: number;
  /** Median time to first token for a gold medal, seconds. */
  ttftGold: number;
  kvScale: number;
  hazards: Hazards;
  tint: [string, string, string];
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'boiler',
    act: 1,
    film: 'spirited',
    lanes: 2,
    spawnStart: 1.4,
    spawnEnd: 1,
    mix: { fp8: 3, bf16: 2 },
    users: [1, 3],
    goal: 9000,
    seconds: 75,
    slo: 18,
    ttftGold: 9,
    kvScale: 1,
    hazards: {},
    tint: ['#5a3a26', '#8a5632', '#e6b46c'],
  },
  {
    id: 'river',
    act: 1,
    film: 'spirited',
    lanes: 3,
    spawnStart: 1.2,
    spawnEnd: 0.85,
    mix: { fp8: 3, bf16: 2, longkv: 3 },
    users: [1, 3],
    goal: 10000,
    seconds: 80,
    slo: 18,
    ttftGold: 9,
    kvScale: 0.9,
    hazards: { river: true },
    tint: ['#2c4a4a', '#4f7a70', '#c9d9b8'],
  },
  {
    id: 'bathhouse',
    act: 1,
    film: 'spirited',
    lanes: 4,
    spawnStart: 1.1,
    spawnEnd: 0.8,
    mix: { fp4: 2, fp8: 3, bf16: 2, longkv: 1 },
    users: [1, 3],
    goal: 12000,
    seconds: 85,
    slo: 20,
    ttftGold: 9,
    kvScale: 1,
    hazards: { noface: true },
    tint: ['#4a1e1e', '#8a2f26', '#e8b96a'],
  },
  {
    id: 'castle',
    act: 2,
    film: 'howl',
    lanes: 4,
    spawnStart: 1.05,
    spawnEnd: 0.75,
    mix: { fp4: 2, fp8: 3, bf16: 3, longkv: 1 },
    users: [1, 4],
    goal: 17000,
    seconds: 90,
    slo: 20,
    ttftGold: 8.5,
    kvScale: 1.05,
    hazards: { castle: true, ash: true },
    tint: ['#2d3650', '#566a8a', '#e9c98a'],
  },
  {
    id: 'forest',
    act: 3,
    film: 'mononoke',
    lanes: 4,
    spawnStart: 1,
    spawnEnd: 0.72,
    mix: { fp4: 3, fp8: 3, bf16: 2, longkv: 2 },
    users: [1, 4],
    goal: 12000,
    seconds: 90,
    slo: 22,
    ttftGold: 8.5,
    kvScale: 1.1,
    hazards: { night: true, curse: true },
    tint: ['#1f3326', '#3f6a45', '#c6d8a0'],
  },
  {
    id: 'flood',
    act: 3,
    film: 'ponyo',
    lanes: 4,
    spawnStart: 0.95,
    spawnEnd: 0.7,
    mix: { fp4: 3, fp8: 3, bf16: 2, longkv: 2 },
    users: [1, 4],
    goal: 18000,
    seconds: 95,
    slo: 22,
    ttftGold: 8,
    kvScale: 1.1,
    hazards: { tide: true },
    tint: ['#1c3d5a', '#3f7fa6', '#d8eef0'],
  },
  {
    id: 'tower',
    act: 4,
    film: 'heron',
    lanes: 4,
    spawnStart: 0.9,
    spawnEnd: 0.65,
    mix: { fp4: 3, fp8: 3, bf16: 3, longkv: 2 },
    users: [1, 4],
    goal: 16000,
    seconds: 100,
    slo: 24,
    ttftGold: 8,
    kvScale: 1.15,
    hazards: { parakeets: true, noface: true },
    tint: ['#2e2a40', '#5b5478', '#e7c9a4'],
  },
  {
    id: 'banquet',
    act: 4,
    film: 'spirited',
    lanes: 4,
    spawnStart: 0.95,
    spawnEnd: 0.7,
    mix: { fp4: 3, fp8: 3, bf16: 2, longkv: 2 },
    users: [1, 4],
    goal: 36000,
    seconds: 160,
    slo: 22,
    ttftGold: 8,
    kvScale: 1.15,
    hazards: { boss: true },
    tint: ['#3a1416', '#7a2420', '#f0c070'],
  },
];

export const ACTS = [1, 2, 3, 4] as const;

/** Fuel blends: the precision the whole shift runs at. */
export const BLEND_SPECS = {
  fp8: { kv: 1, decode: 1, quality: 1 },
  fp4: { kv: 0.7, decode: 1.15, quality: 0.85 },
  bf16: { kv: 1.3, decode: 0.92, quality: 1.15 },
} as const;

export interface UpgradeSpec {
  id: UpgradeId;
  cost: readonly [number, number, number];
}

export const UPGRADES: readonly UpgradeSpec[] = [
  { id: 'boiler', cost: [5, 9, 14] },
  { id: 'appetite', cost: [6, 10, 16] },
  { id: 'soot', cost: [4, 8, 12] },
  { id: 'tags', cost: [5, 9, 14] },
  { id: 'hearth', cost: [6, 11, 17] },
  { id: 'prefix', cost: [7, 12, 18] },
];

export interface Tuning {
  kvCap: number;
  decode: number;
  walk: number;
  tags: number;
  batchCap: number;
  /** Fraction of KV saved when a lump of the same kind follows another (prefix reuse). */
  prefix: number;
}

export function tuningFor(levels: Partial<Record<UpgradeId, number>>): Tuning {
  const level = (id: UpgradeId) => levels[id] ?? 0;
  return {
    kvCap: 64 * (1 + 0.2 * level('boiler')),
    decode: 1 + 0.1 * level('appetite'),
    walk: 1 + 0.16 * level('soot'),
    tags: 2 + level('tags'),
    batchCap: 32 + 10 * level('hearth'),
    prefix: 0.12 * level('prefix'),
  };
}

/** Endless shift cycles hazards in this order, one film per wave. */
export const ENDLESS_WAVES: readonly Hazards[] = [
  {},
  { river: true },
  { noface: true },
  { ash: true },
  { night: true, curse: true },
  { tide: true },
  { parakeets: true },
  { noface: true, tide: true },
  { night: true, parakeets: true },
];
